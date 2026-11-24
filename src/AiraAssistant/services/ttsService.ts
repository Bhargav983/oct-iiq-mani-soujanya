import { speechText, speechLanguage } from './voiceLanguage';
/**
 * Gemini TTS playback through the server-side AiraAssistant speech gateway.
 */

import type { AuthParamsInput } from './api';

interface TTSResponse {
  blob: Blob;
  audioUrl: string;
}

/**
 * Gateway WAV is mono 16-bit PCM; the rate is read from the fmt chunk so a
 * change server-side cannot desync playback.
 */
const FALLBACK_SAMPLE_RATE = 24000;
/** Start playback once this much PCM is buffered (~0.2s at 24 kHz). */
const PREFETCH_BYTES = 9600;
/** Decode at most this many bytes per block so a large reply cannot jank the UI. */
const CHUNK_BYTES = 65536;
/** Stop buffering ahead of the playhead beyond this (~8s at 24 kHz). */
const MAX_BUFFER_BYTES = 384000;

// ---------------------------------------------------------------------------
// Endpoint configuration
// ---------------------------------------------------------------------------

const GEMINI_TTS_URL = process.env.REACT_APP_GEMINI_TTS_URL || '/api/aira-voice/tts';
export const PLAYBACK_INTERRUPTION_EVENT = 'airaPlaybackInterruption';

// ---------------------------------------------------------------------------
// Arabic script detection
// ---------------------------------------------------------------------------

/**
 * Returns true if `text` contains any character from the Arabic Unicode
 * block (incl. Arabic Supplement and Arabic Extended-A). Retained as a
 * utility for AiraAssistant language-aware speech behavior.
 */
export function isArabicText(text: string): boolean {
  if (!text) return false;
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  return arabicRegex.test(text);
}

class TTSService {
  private interruption: 'paused' | 'resuming' | 'resumed' | null = null;
  public playbackInterruption = () => this.interruption;
  private setInterruption(state: typeof this.interruption) {
    if (this.interruption === state) return;
    this.interruption = state;
    window.dispatchEvent(new Event(PLAYBACK_INTERRUPTION_EVENT));
  }

  public pauseForBackground(): void {
    if (this.interruption === 'paused') return;
    if (this.stream?.started) {
      this.setInterruption('paused');
      void this.stream.context.suspend().catch(() => undefined);
    } else if (this.currentAudio && this.currentAudio.currentTime > 0 && !this.currentAudio.ended) {
      this.setInterruption('paused');
      this.currentAudio.pause();
    } else {
      this.stopCurrentAudio();
    }
  }

  public async resumeInterrupted(): Promise<void> {
    if (this.interruption !== 'paused' || document.hidden) return;
    const generation = this.generation;
    this.setInterruption('resuming');
    try {
      if (this.stream) await this.stream.context.resume();
      else await this.currentAudio?.play();
      if (generation === this.generation && this.playbackInterruption() === 'resuming') {
        this.setInterruption('resumed');
      }
    } catch (error) {
      if (generation === this.generation) this.setInterruption('paused');
      throw error;
    }
  }
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private finishPlayback: (() => void) | null = null;
  private generation = 0;
  private cache = new Map<string, Blob>();
  private remember(key: string, blob: Blob) {
    if (blob.size > 2 * 1024 * 1024) return;
    this.cache.set(key, blob);
    while (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
  }
  private synthesis: AbortController | null = null;
  /** Live streaming playback, when the gateway response is consumed progressively. */
  private stream: {
    context: AudioContext;
    sampleRate: number;
    started: boolean;
    /** Set when playback is stopped early so pumps bail out. */
    stopped: boolean;
  } | null = null;

  /**
   * Play TTS audio for the given text.
   *
   * @param text             Text to convert to speech.
   * @param onPlaybackStart  Optional callback fired once audio synthesis has
   *                         finished and actual playback begins (used by the
   *                         voice overlay to switch its waveform from
   *                         "Preparing response..." to "speaking").
   * @param auth             Authenticated identity for the current session.
   *                         Sourced from React <AuthContext /> via the
   *                         VoiceAssistantProvider -> useVoiceAssistant and
   *                         forwarded into the AiraAssistant gateway request
   *                         so the server can attribute the synthesis to the
   *                         correct customer/company. Optional so legacy
   *                         call sites (and tests) keep working; when
   *                         omitted the body still satisfies the
   *                         server-side contract with empty strings.
   * @returns Promise that resolves when audio playback completes or rejects on error
   */
  public async playTTS(
    text: string,
    onPlaybackStart?: () => void,
    auth?: AuthParamsInput,
  ): Promise<void> {
    text = speechText(text);
    const started = performance.now();
    // Stop any currently playing audio
    this.stopCurrentAudio();
    const generation = this.generation;
    const synthesis = new AbortController();
    this.synthesis = synthesis;

    try {
      const cacheKey = JSON.stringify([text, auth?.userId, auth?.companyId]);
      const cached = this.cache.get(cacheKey);
      if (cached) { await this.playAudioBlob(cached, onPlaybackStart); return; }
      console.log('🔊 [TTS] Converting text to speech:', text.substring(0, 50) + '...');

      // The gateway keeps Gemini credentials server-side and returns
      // audio/wav for the shared playback lifecycle below.
      const response = await fetch(GEMINI_TTS_URL, {
        signal: synthesis.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: speechLanguage(text),
          // Same contract as the chat webhook — empty strings are sent
          // through unchanged when AuthContext has not yet hydrated.
          user_id: auth?.userId ?? '',
          company_id: auth?.companyId ?? '',
        }),
      });
      if (generation !== this.generation) return;

      if (!response.ok) {
        throw new Error(`Gemini TTS request failed: ${response.status} ${response.statusText}`);
      }

      // Stream the response into the Web Audio graph so the first synthesised
      // bytes are audible while the rest of the reply is still downloading.
      // The gateway sets Content-Length and buffers its synthesis, so waiting
      // for the whole body added the full download time to time-to-first-audio.
      // Once the body is consumed it cannot be re-read, so a streamed response
      // never falls back to the blob path.
      if (response.body && typeof AudioContext !== 'undefined') {
        await this.playStreamingWav(response, generation, onPlaybackStart, cacheKey, started);
        return;
      }

      // Fallback: no readable stream (or unsupported browser) — old blob path.
      const audioBlob = await response.blob();
      if (generation !== this.generation) return;
      console.log('🔊 [TTS] Received audio blob:', audioBlob.size, 'bytes');

      // Hand off to the shared audio-element / Promise lifecycle.
      // Keep audio lifecycle and cancellation behavior unchanged.
      this.remember(cacheKey, audioBlob);
      console.info('[VoiceTiming] synthesis-ready-ms', Math.round(performance.now() - started));
      await this.playAudioBlob(audioBlob, onPlaybackStart);

    } catch (error) {
      if (generation !== this.generation) return;
      console.error('🔊 [TTS] Failed to play TTS:', error);
      this.cleanupAudio();
      throw error;
    }
  }

  /**
   * Progressive playback of a WAV response.
   *
   * The gateway returns PCM WAV (`fmt` chunk, 16-bit). PCM can be decoded
   * incrementally, so each downloaded chunk is scheduled on the audio graph
   * instead of waiting for the complete file. Blocks are chained at the exact
   * end time of the previous one so the reply plays as one continuous stream.
   */
  private async playStreamingWav(
    response: Response,
    generation: number,
    onPlaybackStart?: () => void,
    cacheKey?: string,
    startedAt?: number,
  ): Promise<void> {
    const body = response.body!;
    const context = new AudioContext();
    const session = { context, sampleRate: FALLBACK_SAMPLE_RATE, started: false, stopped: false };
    this.stream = session;
    // Register for the global teardown that suspends voice audio contexts.
    const voiceWindow = window as Window & { __airaVoiceAudioContexts__?: Set<AudioContext> };
    (voiceWindow.__airaVoiceAudioContexts__ ??= new Set()).add(context);
    if (context.state === 'suspended') void context.resume().catch(() => undefined);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        voiceWindow.__airaVoiceAudioContexts__?.delete(context);
        if (this.stream === session) {
          this.stream = null;
          this.finishPlayback = null;
          this.setInterruption(null);
        }
        if (error) reject(error);
        else resolve();
      };

      const reader = body.getReader();
      let carry = new Uint8Array();
      let parsedHeader = false;
      let dataRemaining = 0;
      /** Raw response bytes, retained so a repeat of this reply can be replayed. */
      const received: Uint8Array[] = [];
      /** End of already-scheduled audio on the context timeline. */
      let scheduledUntil = 0;
      let scheduledSamples = 0;
      let lastSource: AudioBufferSourceNode | null = null;
      let pumping = false;
      let pending: Float32Array[] = [];
      let pendingSamples = 0;
      /** True once the response body is fully drained; playback may still be running. */
      let bodyDone = false;
      /** Set when playback ends before the body finished, so the drain can settle. */
      let playbackEnded = false;

      /** Schedules decoded PCM immediately after whatever is already queued. */
      const schedule = (samples: Float32Array) => {
        if (!samples.length || session.stopped) return;
        const rate = session.sampleRate;
        const buffer = context.createBuffer(1, samples.length, rate);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        // Seamless chaining: start exactly when the previous block ends.
        const startAt = Math.max(scheduledUntil, context.currentTime);
        source.start(startAt);
        scheduledUntil = startAt + samples.length / rate;
        scheduledSamples += samples.length;
        playbackEnded = false;
        lastSource = source;
        source.onended = () => {
          if (source !== lastSource || session.stopped) return;
          // Last scheduled block finished. If the body is still downloading
          // (stalled mid-reply), wait for the drain to settle the turn so the
          // caller does not move on and cut the remaining audio off.
          console.log('🔊 [TTS] Streaming playback completed');
          playbackEnded = true;
          if (bodyDone) {
            void context.close().catch(() => undefined);
            settle();
          }
        };
        if (!session.started) {
          session.started = true;
          if (startedAt !== undefined) {
            console.info('[VoiceTiming] synthesis-ready-ms', Math.round(performance.now() - startedAt));
          }
          console.log('🔊 [TTS] Streaming playback started');
          onPlaybackStart?.();
        }
      };

      /** Buffers PCM until enough has arrived to start playback without underrun. */
      const enqueue = (samples: Float32Array) => {
        if (!samples.length || session.stopped) return;
        pending.push(samples);
        pendingSamples += samples.length;
        if (pendingSamples * 2 >= PREFETCH_BYTES) flushPending();
      };

      const flushPending = () => {
        if (!pending.length) return;
        const merged = concatFloat(pending);
        pending = [];
        pendingSamples = 0;
        schedule(merged);
      };

      const pump = async (): Promise<void> => {
        if (pumping) return;
        pumping = true;
        try {
          while (!session.stopped && generation === this.generation) {
            const { done, value } = await reader.read();
            if (done || !value?.length) break;
            received.push(value);
            carry = concatBytes(carry, value);
            if (!parsedHeader) {
              const header = parseWavPrefix(carry);
              if (header.dataStart < 0) continue; // need more bytes for the header
              if (header.sampleRate) session.sampleRate = header.sampleRate;
              dataRemaining = header.dataSize;
              carry = carry.subarray(header.dataStart);
              parsedHeader = true;
            }
            // Keep the carry 16-bit aligned: a network chunk can end mid-sample,
            // and decoding an odd-length block would pair each byte with the
            // wrong neighbour and turn the rest of the reply into noise.
            const available = Math.min(carry.length - (carry.length % 2), dataRemaining);
            if (available > 0) {
              const block = carry.subarray(0, available);
              carry = carry.subarray(available);
              dataRemaining -= available;
              for (const piece of splitPcm(block)) enqueue(piece);
            }
            // Bound ahead-of-playhead buffering so a fast download cannot balloon memory.
            while (session.started && !session.stopped && generation === this.generation
              && (scheduledUntil - context.currentTime) * session.sampleRate * 2 > MAX_BUFFER_BYTES) {
              await new Promise(r => setTimeout(r, 50));
            }
          }
          if (session.stopped || generation !== this.generation) return;
          // Body drained: flush whatever is still buffered so nothing is cut off.
          flushPending();
          if (cacheKey && received.length) this.remember(cacheKey, new Blob(received, { type: 'audio/wav' }));
          if (!session.started) {
            // Short reply: the whole body arrived before the prefetch threshold.
            if (!scheduledSamples) {
              void context.close().catch(() => undefined);
              settle();
              return;
            }
            session.started = true;
            if (startedAt !== undefined) {
              console.info('[VoiceTiming] synthesis-ready-ms', Math.round(performance.now() - startedAt));
            }
            console.log('🔊 [TTS] Streaming playback started');
            onPlaybackStart?.();
          }
          bodyDone = true;
          if (!lastSource || playbackEnded) {
            void context.close().catch(() => undefined);
            settle();
            return;
          }
          // Playback is still running; the last source's onended settles the turn.
        } catch (error) {
          session.stopped = true;
          try { lastSource?.stop(); } catch { /* not started */ }
          void context.close().catch(() => undefined);
          settle(error);
        } finally {
          pumping = false;
        }
      };

      void pump();
      this.finishPlayback = () => settle();
    });
  }

  /**
   * Shared audio-element setup + playback keeps mobile autoplay behavior,
   * the <audio> element wiring, and the Promise wrapper that holds the
   * UI in the SPEAKING state until playback ends.
   *
   * IMPORTANT: this wrapper keeps the existing lifecycle
   * (resolve on `onended`, reject on `onerror` / play() rejection) — the
   * voice overlay's "speaking" UI depends on the promise not resolving
   * until the audio actually finishes.
   */
  private playAudioBlob(
    audioBlob: Blob,
    onPlaybackStart?: () => void,
  ): Promise<void> {
    // Convert response to audio blob
    const audioUrl = URL.createObjectURL(audioBlob);

    // Create and configure audio element
    this.currentAudio = new Audio(audioUrl);
    // Mobile (iOS Safari) autoplay compliance: force inline playback
    // so the audio does not try to take over the full screen, which
    // would block the user gesture that triggered the utterance.
    this.currentAudio.setAttribute('playsinline', 'true');
    this.currentAudio.setAttribute('webkit-playsinline', 'true');
    this.currentAudioUrl = audioUrl;

    // Set up event handlers and start playback.
    // IMPORTANT: the returned promise resolves when playback ENDS (onended),
    // not when it starts. This lets callers (useVoiceAssistant) hold the
    // SPEAKING state for the full playback duration — resolving at start
    // caused updateState('IDLE') to overwrite SPEAKING within milliseconds,
    // so the UI never showed the speaking phase or the Stop-TTS button.
    return new Promise<void>((resolve, reject) => {
      this.finishPlayback = resolve;
      const audio = this.currentAudio!;
      this.currentAudio!.onended = () => {
        console.log('🔊 [TTS] Audio playback completed');
        this.cleanupAudio();
        resolve();
      };

      this.currentAudio!.onerror = (error) => {
        console.error('🔊 [TTS] Audio playback error:', error);
        this.cleanupAudio();
        reject(new Error('TTS audio playback failed'));
      };

      // Start playback
      this.currentAudio!.play()
        .then(() => {
          if (this.currentAudio !== audio) return;
          console.log('🔊 [TTS] Audio playback started');
          // Synthesis is complete — actual audible playback has begun.
          onPlaybackStart?.();
        })
        .catch((playError) => {
          if (this.currentAudio !== audio) return;
          console.error('🔊 [TTS] Failed to start playback:', playError);
          this.cleanupAudio();
          reject(playError);
        });
    });
  }

  /**
   * Stop any currently playing audio
   */
  public stopCurrentAudio(): void {
    ++this.generation;
    this.synthesis?.abort();
    this.synthesis = null;
    const finish = this.finishPlayback;
    this.stopStream();
    this.cleanupAudio();
    finish?.();
  }

  /** Tear down a live streaming playback session. */
  private stopStream(): void {
    const session = this.stream;
    if (!session) return;
    session.stopped = true;
    // Disconnecting the destination silences every already-scheduled block at
    // once; closing the context stops the timeline immediately.
    void session.context.close().catch(() => undefined);
    this.stream = null;
  }

  /**
   * Clean up audio resources
   */
  private cleanupAudio(): void {
    this.setInterruption(null);
    this.finishPlayback = null;
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio.load();
      this.currentAudio = null;
    }

    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }

  /**
   * Check if TTS is currently playing
   */
  public isPlaying(): boolean {
    if (this.stream) return true;
    return this.currentAudio !== null && !this.currentAudio.paused && !this.currentAudio.ended;
  }
}

/** Reads the WAV `fmt`/`data` chunk header from a partial byte buffer. */
function parseWavPrefix(bytes: Uint8Array): { sampleRate: number | null; dataStart: number; dataSize: number } {
  if (bytes.length < 44) return { sampleRate: null, dataStart: -1, dataSize: 0 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate: number | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= bytes.length) {
      const rate = view.getUint32(body + 4, true);
      if (rate > 0) sampleRate = rate;
    }
    if (id === 'data') return { sampleRate, dataStart: body, dataSize: size };
    offset = body + size + (size % 2);
  }
  return { sampleRate, dataStart: -1, dataSize: 0 };
}

/** Splits raw PCM16 bytes into decode-sized blocks. */
function splitPcm(bytes: Uint8Array): Float32Array[] {
  const out: Float32Array[] = [];
  const usable = bytes.length - (bytes.length % 2);
  for (let start = 0; start < usable; start += CHUNK_BYTES) {
    const end = Math.min(start + CHUNK_BYTES, usable);
    const block = bytes.subarray(start, end);
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    const samples = new Float32Array(block.length / 2);
    for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(i * 2, true) / 0x8000;
    out.push(samples);
  }
  return out;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left); merged.set(right, left.length);
  return merged;
}

function concatFloat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.length; }
  return merged;
}

// Export singleton instance
export const ttsService = new TTSService();

// Export the main function for convenience
export async function playTTS(
  text: string,
  onPlaybackStart?: () => void,
  auth?: AuthParamsInput,
): Promise<void> {
  return ttsService.playTTS(text, onPlaybackStart, auth);
}
