/**
 * TTS Service for playing Kokoro TTS responses from n8n
 *
 * Two backends are supported, selected per-utterance by script:
 *   - Kokoro   — default English TTS at /v1/tts
 *   - Nabra    — Arabic TTS at /v1/audio/speech, used when the text
 *                contains Arabic Unicode (see isArabicText). If the
 *                Nabra endpoint fails for any reason the call falls
 *                through to Kokoro so a single failed request never
 *                silences the assistant.
 */

import type { AuthParamsInput } from './api';

interface TTSResponse {
  blob: Blob;
  audioUrl: string;
}

// ---------------------------------------------------------------------------
// Endpoint configuration
// ---------------------------------------------------------------------------

/**
 * Default English TTS backend. Overridable at build time via
 * REACT_APP_KOKORO_TTS_URL for staging / on-prem environments.
 */
const KOKORO_TTS_URL =
  process.env.REACT_APP_KOKORO_TTS_URL || 'https://n8ncustomer.air2o.net/v1/tts';

/**
 * Arabic TTS backend. Used only when `isArabicText(text)` is true; on
 * any failure we log and fall through to the Kokoro endpoint so a
 * downstream Nabra outage cannot silence the assistant.
 */
const NABRA_TTS_URL =
  process.env.REACT_APP_NABRA_TTS_URL ||
  'https://n8ncustomer.air2o.net/v1/audio/speech';

// ---------------------------------------------------------------------------
// Arabic script detection
// ---------------------------------------------------------------------------

/**
 * Returns true if `text` contains any character from the Arabic Unicode
 * block (incl. Arabic Supplement and Arabic Extended-A). Used to route
 * utterances to the Nabra Arabic backend. Pure heuristic — robust enough
 * for code-switched replies where the first / dominant language decides
 * the voice, and intentionally simple so we never over-classify a
 * Latin-only reply as Arabic.
 */
export function isArabicText(text: string): boolean {
  if (!text) return false;
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  return arabicRegex.test(text);
}

class TTSService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;

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
   *                         forwarded into the n8n TTS request body so the
   *                         server can attribute the synthesis to the
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
    // Stop any currently playing audio
    this.stopCurrentAudio();

    try {
      console.log('🔊 [TTS] Converting text to speech:', text.substring(0, 50) + '...');

      // -----------------------------------------------------------------
      // Language routing — Arabic replies go to Nabra first; on any
      // failure we log and fall through to the existing Kokoro path so
      // a Nabra outage can never silence the assistant. The Kokoro
      // fetch, auth body, audio-element setup, and Promise lifecycle
      // below are intentionally UNCHANGED.
      // -----------------------------------------------------------------
      const isArabic = isArabicText(text);
      if (isArabic) {
        try {
          console.log('🌙 [TTS] Arabic script detected — routing to Nabra endpoint');
          const nabraResponse = await fetch(NABRA_TTS_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
          });
          if (!nabraResponse.ok) {
            throw new Error(
              `Nabra TTS request failed: ${nabraResponse.status} ${nabraResponse.statusText}`,
            );
          }
          const nabraBlob = await nabraResponse.blob();
          console.log('🌙 [TTS] Nabra returned audio blob:', nabraBlob.size, 'bytes');
          await this.playAudioBlob(nabraBlob, onPlaybackStart);
          return;
        } catch (nabraError) {
          // Nabra is best-effort. Log and fall through to Kokoro so the
          // user still hears a reply, even if it is in a non-native voice.
          console.error(
            '🔴 [TTS] Nabra Arabic endpoint error, falling back to Kokoro',
            nabraError,
          );
        }
      }

      // Send request to Kokoro TTS server.
      // Authenticated identity is threaded through from the late-bound
      // authRef in useVoiceAssistant so the TTS server sees the same
      // customer/company as the STT handshake and the n8n chat webhook.
      const response = await fetch(KOKORO_TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          voice: 'af_sarah',
          response_format: 'wav',
          // Same contract as the chat webhook — empty strings are sent
          // through unchanged when AuthContext has not yet hydrated.
          user_id: auth?.userId ?? '',
          company_id: auth?.companyId ?? '',
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
      }

      // Convert response to audio blob
      const audioBlob = await response.blob();
      console.log('🔊 [TTS] Received audio blob:', audioBlob.size, 'bytes');

      // Hand off to the shared audio-element / Promise lifecycle.
      // The Kokoro fetch above is intentionally unchanged; everything
      // from this point on is identical for the Nabra and Kokoro paths.
      await this.playAudioBlob(audioBlob, onPlaybackStart);

    } catch (error) {
      console.error('🔊 [TTS] Failed to play TTS:', error);
      this.cleanupAudio();
      throw error;
    }
  }

  /**
   * Shared audio-element setup + playback. Used by BOTH the Kokoro and
   * Nabra paths so they share a single implementation of the
   * <audio> element wiring, mobile autoplay compliance, and the
   * `new Promise<void>((resolve, reject) => …)` wrapper that holds the
   * UI in the SPEAKING state until playback ends.
   *
   * IMPORTANT: this wrapper is intentionally preserved verbatim from
   * the original Kokoro-only implementation. Do NOT alter its lifecycle
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
          console.log('🔊 [TTS] Audio playback started');
          // Synthesis is complete — actual audible playback has begun.
          onPlaybackStart?.();
        })
        .catch((playError) => {
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
    if (this.currentAudio) {
      console.log('🔊 [TTS] Stopping current audio playback');
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
  }

  /**
   * Clean up audio resources
   */
  private cleanupAudio(): void {
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
    return this.currentAudio !== null && !this.currentAudio.paused && !this.currentAudio.ended;
  }
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