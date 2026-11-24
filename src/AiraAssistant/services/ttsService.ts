import { speechText, speechLanguage } from './voiceLanguage';
/**
 * Gemini TTS playback through the server-side AiraAssistant speech gateway.
 */

import type { AuthParamsInput } from './api';

/**
 * Minimal reader surface shared by the network stream and the replay cache.
 * `cancel` releases the in-flight HTTP body when playback is stopped.
 */
type PcmReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?: () => Promise<void>;
};

/**
 * Gateway TTS is headerless Linear PCM: `audio/l16` at 24 kHz, 16-bit signed
 * little-endian, mono. There is no RIFF/fmt/data container, so the rate is a
 * fixed constant rather than something read out of the stream.
 */
const PCM_SAMPLE_RATE = 24000;
/**
 * Jitter buffer: hold this much decoded audio before the first block starts so
 * an uneven first network burst cannot underrun the graph (~120 ms at 24 kHz).
 */
const PREFETCH_SAMPLES = 2880;
/** Decode at most this many samples per block so a large reply cannot jank the UI. */
const CHUNK_SAMPLES = 32768;
/** Stop buffering ahead of the playhead beyond this (~8s at 24 kHz). */
const MAX_BUFFER_SAMPLES = 192000;

// ---------------------------------------------------------------------------
// Endpoint configuration
// ---------------------------------------------------------------------------

const GEMINI_TTS_URL = process.env.REACT_APP_GEMINI_TTS_URL || '/api/aira-voice/tts/stream';
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
      if (generation === this.generation && this.playbackInterruption() === 'resuming') {
        this.setInterruption('resumed');
      }
    } catch (error) {
      if (generation === this.generation) this.setInterruption('paused');
      throw error;
    }
  }
  private finishPlayback: (() => void) | null = null;
  private generation = 0;
  /**
   * Replay cache of raw PCM bytes. The stream is headerless, so the cached
   * bytes are replayed through the same decoder as a live response rather
   * than through an <audio> element (which needs a container).
   */
  private cache = new Map<string, Uint8Array>();
  private remember(key: string, bytes: Uint8Array) {
    if (bytes.length > 2 * 1024 * 1024) return;
    this.cache.set(key, bytes);
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
    /** Cancelling releases the in-flight HTTP body. */
    reader: PcmReader;
    /** Every scheduled block, so a stop can silence queued audio too. */
    sources: AudioBufferSourceNode[];
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
      if (cached) {
        // Replay cached PCM through the same decoder as a live response.
        await this.playStreamingPcm(readerFromBytes(cached), generation, onPlaybackStart, started);
        return;
      }
      console.log('🔊 [TTS] Converting text to speech:', text.substring(0, 50) + '...');

      // The gateway keeps Gemini credentials server-side and streams back
      // headerless 24 kHz Linear PCM.
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
      // The gateway streams chunked raw PCM with no Content-Length, so the
      // body is the only source of audio — it must be consumed progressively
      // and cannot be replayed from a blob.
      await this.playStreamingPcm(response, generation, onPlaybackStart, started, cacheKey);

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
  /**
   * Progressive playback of the raw PCM response.
   *
   * The gateway returns headerless `audio/l16` (24 kHz, 16-bit signed
   * little-endian, mono) as a chunked body. There is no container, so
   * `decodeAudioData()` cannot be used — samples are converted to `Float32`
   * here and scheduled as they arrive.
   *
   * Two details keep the audio clean:
   *   - A network chunk can end mid-sample, so the reader carries the odd byte
   *     into the next block. Decoding an odd-length buffer would pair each
   *     byte with the wrong neighbour and turn the rest of the reply to noise.
   *   - Blocks are scheduled on a running `nextStartTime` cursor rather than
   *     `currentTime`, so uneven network bursts chain seamlessly instead of
   *     overlapping or leaving gaps.
   */
  private async playStreamingPcm(
    source: Response | { getReader: () => PcmReader },
    generation: number,
    onPlaybackStart?: () => void,
    startedAt?: number,
    cacheKey?: string,
  ): Promise<void> {
    // Structural check rather than `instanceof Response`: `Response` is not a
    // global in every environment this module is exercised in.
    const reader = 'getReader' in source && typeof source.getReader === 'function'
      ? source.getReader()
      : (source.body ?? throwNoBody()).getReader();

    const context = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
    const session = {
      context,
      sampleRate: PCM_SAMPLE_RATE,
      started: false,
      stopped: false,
      reader,
      sources: [] as AudioBufferSourceNode[],
    };
    this.stream = session;
    // Register for the global teardown that suspends voice audio contexts.
    const voiceWindow = window as Window & { __airaVoiceAudioContexts__?: Set<AudioContext> };
    (voiceWindow.__airaVoiceAudioContexts__ ??= new Set()).add(context);
    // iOS/Safari start the context suspended until a user gesture resumes it.
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

      /** Trailing byte of the previous chunk when a chunk ended mid-sample. */
      let carry: number | null = null;
      /** Audio already handed to the graph, on the context timeline. */
      let nextStartTime = 0;
      let scheduledSamples = 0;
      let lastSource: AudioBufferSourceNode | null = null;
      /** Decoded samples waiting for the jitter buffer to fill. */
      let pending: Float32Array[] = [];
      let pendingSamples = 0;
      /** Raw response bytes, retained so a repeat of this reply can be replayed. */
      const received: Uint8Array[] = [];
      let receivedBytes = 0;
      /** True once the response body is fully drained; playback may still be running. */
      let bodyDone = false;
      /** Set when playback ends before the body finished, so the drain can settle. */
      let playbackEnded = false;

      /** Schedules decoded PCM immediately after whatever is already queued. */
      const schedule = (samples: Float32Array) => {
        if (!samples.length || session.stopped) return;
        const buffer = context.createBuffer(1, samples.length, session.sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        // Seamless chaining: start exactly when the previous block ends, and
        // never before the playhead so a slow chunk cannot schedule in the past.
        const startAt = Math.max(nextStartTime, context.currentTime);
        source.start(startAt);
        nextStartTime = startAt + samples.length / session.sampleRate;
        scheduledSamples += samples.length;
        lastSource = source;
        session.sources.push(source);
        source.onended = () => {
          if (source !== lastSource || session.stopped) return;
          // Last scheduled block finished. If the body is still downloading
          // (stalled mid-reply), wait for the drain to settle the turn so the
          // caller does not move on and cut the remaining audio off.
          console.log('🔊 [TTS] Streaming playback completed');
          this.finishPlayback = null;
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

      const flushPending = () => {
        if (!pending.length) return;
        const merged = concatFloat(pending);
        pending = [];
        pendingSamples = 0;
        schedule(merged);
      };

      /**
       * Converts raw PCM16 bytes to Float32 samples. `carryByte` is the odd
       * trailing byte left by the previous chunk, if any.
       */
      const decode = (bytes: Uint8Array, carryByte: number | null): { samples: Float32Array; carry: number | null } => {
        // Re-align: prepend the carried byte so every pair is a real sample.
        const aligned = carryByte === null
          ? bytes
          : (() => { const merged = new Uint8Array(bytes.length + 1); merged[0] = carryByte; merged.set(bytes, 1); return merged; })();
        const usable = aligned.length - (aligned.length % 2);
        const nextCarry = usable < aligned.length ? aligned[aligned.length - 1] : null;
        // Copy into a fresh buffer: `subarray` results are views whose backing
        // ArrayBufferLike is not accepted by `copyToChannel`.
        const alignedBytes = new Uint8Array(usable);
        alignedBytes.set(aligned.subarray(0, usable));
        const view = new DataView(alignedBytes.buffer);
        const samples = new Float32Array(usable / 2);
        for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;
        return { samples, carry: nextCarry };
      };

      const pump = async (): Promise<void> => {
        try {
          while (!session.stopped && generation === this.generation) {
            const { done, value } = await reader.read();
            if (done || !value?.length) break;
            received.push(value);
            receivedBytes += value.length;
            const { samples, carry: nextCarry } = decode(value, carry);
            carry = nextCarry;
            if (samples.length) {
              pending.push(samples);
              pendingSamples += samples.length;
              // Hold the jitter buffer before the first block, then stream freely.
              if (!session.started) {
                if (pendingSamples >= PREFETCH_SAMPLES) flushPending();
              } else {
                flushPending();
              }
            }
            // Bound ahead-of-playhead buffering so a fast download cannot balloon memory.
            while (!session.stopped && generation === this.generation
              && session.started
              && (nextStartTime - context.currentTime) * session.sampleRate > MAX_BUFFER_SAMPLES) {
              await new Promise(r => setTimeout(r, 50));
            }
          }
          if (session.stopped || generation !== this.generation) return;
          // Body drained: flush whatever is still buffered so nothing is cut off.
          flushPending();
          if (cacheKey && received.length) this.remember(cacheKey, flattenBytes(received, receivedBytes));
          if (!session.started) {
            // Reply shorter than the jitter buffer, or the stream carried no audio.
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
        }
      };

      void pump();
      this.finishPlayback = () => settle();
    });
  }

  /**
   * Shared audio-element setup + playback keeps mobile autoplay behavior,
   * the <audio> element wiring, and the Promise wrapper that holds the
  /**
   * Stop any currently playing audio and cancel any in-flight synthesis.
   *
   * Aborting the fetch tears down the HTTP stream immediately, so a cancelled
   * reply stops downloading instead of buffering the rest in the background.
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
    // Cancelling the reader releases the HTTP stream immediately, so a
    // stopped reply stops downloading instead of buffering in the background.
    session.reader.cancel?.().catch(() => undefined);
    // Stop every scheduled block, then close the context so the timeline
    // halts and no queued audio can still play after the user stopped it.
    for (const source of session.sources) {
      try { source.onended = null; source.stop(); } catch { /* not started */ }
    }
    void session.context.close().catch(() => undefined);
    this.stream = null;
  }

  /** Reset transient playback state. */
  private cleanupAudio(): void {
    this.setInterruption(null);
    this.finishPlayback = null;
  }

  /** Check if TTS is currently playing. */
  public isPlaying(): boolean {
    return this.stream !== null;
  }
}

/** Throws the error used when a response carries no readable body. */
function throwNoBody(): never {
  throw new Error('Gemini TTS response has no readable body');
}

/**
 * Wraps cached PCM bytes in a reader so a replay flows through the same
 * streaming decoder as a live response.
 */
function readerFromBytes(bytes: Uint8Array): { getReader: () => PcmReader } {
  return {
    getReader: () => {
      let offset = 0;
      return {
        read: async () => {
          if (offset >= bytes.length) return { done: true, value: undefined };
          // Deliver in network-sized slices so the jitter-buffer and
          // back-pressure paths behave exactly as they do for a live stream.
          const end = Math.min(offset + CHUNK_SAMPLES * 2, bytes.length);
          const value = bytes.subarray(offset, end);
          offset = end;
          return { done: false, value };
        },
      };
    },
  };
}

/** Copies buffered chunks into one contiguous PCM byte array. */
function flattenBytes(parts: Uint8Array[], total: number): Uint8Array {
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.length; }
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
