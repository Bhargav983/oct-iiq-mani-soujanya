import { MESSAGE_PLAYBACK_EVENT, messagePlaybackActive, stopMessagePlayback } from '../services/messagePlayback';
import { ANDROID_AUDIO_EVENT, androidAudioBackgrounded, browserAudioReady, requestAndroidAudioState } from '../services/androidAudio';
import { useMicVAD } from '@ricky0123/vad-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceState } from '../types';
import { GeminiVoiceSocket } from '../services/geminiVoiceSocket';
import { WakeWordService } from '../services/wakeWordService';
import { configureVoiceRuntime, voiceAssets } from '../services/voiceRuntime';
import { audioCancelled, browserMicrophone, openBrowserMicrophone, type MicrophoneLease } from '../services/browserMicrophone';
import { isVoiceSupported } from '../utils/voiceSupport';
import { isPublicRoute } from '../utils/publicRoutes';
import { PLAYBACK_INTERRUPTION_EVENT, playTTS, ttsService } from '../services/ttsService';
import { getAuthContext, type AuthParams } from '../utils/useAuth';
import { ProcessingAudio } from '../services/processingAudio';
import { AssistantError, assistantErrorMessage } from '../services/assistantResponse';
import { requestedLanguage } from '../services/voiceLanguage';

const SAMPLE_RATE = 16000;
/** True when the site runs inside the native iOS app's WebView. */
function isIosNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(w.__AIRA_IOS_APP__)
    || (Boolean(w.ReactNativeWebView) && /iPad|iPhone|iPod/.test(navigator.userAgent));
}

const VAD_ASSET_PATH = voiceAssets.vadPath;
const ONNX_WASM_PATH = voiceAssets.ortPath;
const DEFAULT_STT_URL = '/api/aira-voice/stt';
const WAKE_WORD_KEYWORD_PATH = process.env.REACT_APP_OPENWAKEWORD_KEYWORD_PATH || `${voiceAssets.wakePath}hey_aira.onnx`;
const WAKE_WORD_MODEL_PATH = process.env.REACT_APP_OPENWAKEWORD_MODEL_PATH || voiceAssets.wakePath;

/** Streams VAD-detected PCM16 to STT and keeps a local OpenWakeWord wake-word listener armed between turns. */

type VoiceWindow = Window & {
  __airaVoiceAudioSources__?: Set<AudioBufferSourceNode>;
  __airaVoiceAudioContexts__?: Set<AudioContext>;
};

export interface UseVoiceAssistantResult {
  supported: boolean;
  wakeWordEnabled: boolean;
  state: VoiceState;
  listening: boolean;
  processing: boolean;
  transcript: string;
  done: boolean;
  errorMessage: string | null;
  audioLevel: number;
  start: () => void | Promise<void>;
  stop: () => void;
  cancel: () => void;
  accept: (textOverride?: string) => Promise<void>;
  /**
   * Explicit manual barge-in: stops TTS playback immediately so the user can
   * speak. Unlike VAD auto-barge-in, this works even while the mic-suppression
   * window (isTTSPlayingRef) is active.
   */
  cancelPlayback: () => void;
}

/**
 * NOTE: This hook must only be called from a component that is mounted
 * lazily (see components/VoiceEngine.tsx), on-demand, once the user has
 * actually requested voice input. Calling it unconditionally from a page
 * that mounts/unmounts as part of routing re-introduces the MicVAD
 * create/destroy race that crashes with:
 *   "MicVAD has null stream, audio context, or processor adapter"
 */
export interface UseVoiceAssistantOptions {
  /**
   * When provided, the built-in "wake word -> start MicVAD in this page"
   * behaviour is replaced: after stopping WakeWordService and playing the
   * activation chime, the caller takes over (e.g. the global
   * VoiceAssistantContext navigates to /chat-bot and starts VAD itself).
   */
  onWakeWordDetected?: () => void;
  onSessionEnded?: () => void;
  /**
   * Continuous-session gate for multi-turn voice conversations.
   * When it returns true at the end of a turn (reply spoken), the pipeline
   * automatically resumes listening for the next utterance instead of
   * disarming back to wake-word mode — ChatGPT-style hands-free looping.
   * When it returns false (user exited via ✕ / ⌨️), the wake word is
   * re-armed as before.
   */
  isSessionActive?: () => boolean;
  /**
   * Current React Router pathname. When the path is in the public
   * allowlist (e.g. /login, /, /signup), the wake-word listener is
   * REFUSED permission to arm and any active listener is torn down so
   * the microphone stream is released immediately. The provider layer
   * passes the live pathname here on every render.
   */
  currentPathname?: string;
  /**
   * Authenticated identity for the current session. Sourced from the
   * application's primary <AuthContext /> by the VoiceAssistantProvider
   * and passed in on every render. Used to:
   *   - populate the STT WebSocket handshake frame (see voiceSocket.ts)
   *   - tag any user-supplied transcript sent to the n8n fallback path
   *
   * The hook also keeps a late-bound mirror in `authRef` so async turn
   * handlers always read the latest AuthContext state, never a stale
   * closure value from a previous render.
   */
  auth?: AuthParams;
}

export function useVoiceAssistant(
  onResult: (text: string) => Promise<string | void> | string | void,
  _lang: string,
  options?: UseVoiceAssistantOptions,
): UseVoiceAssistantResult {
  const optionsRef = useRef<UseVoiceAssistantOptions>({});
  optionsRef.current = options ?? {};
  const previousPathRef = useRef(options?.currentPathname);
  /**
   * Late-bound mirror of the authenticated identity. The STT socket's
   * final-transcript callback (and the multi-turn resume loop) live in
   * long-lived closures that outlive the render where the socket was
   * created — a direct reference to `options.auth` would read a stale
   * value from the moment the socket was constructed. The ref is
   * re-pointed on every render so async turn handlers always see the
   * latest <AuthContext /> state, including login/logout/refresh.
   */
  const authRef = useRef<AuthParams>({ userId: '', companyId: '' });
  authRef.current = getAuthContext({
    userId: options?.auth?.userId,
    id: options?.auth?.userId,
    company_id: options?.auth?.companyId,
  } as any);
  const supported = isVoiceSupported();
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);

  const socketRef = useRef<GeminiVoiceSocket | null>(null);
  const wakeWordRef = useRef<WakeWordService | null>(null);
  const wakeWordServiceRef = useRef<WakeWordService | null>(null);
  /**
   * Synchronous arming lock: set BEFORE any async work in armWakeWord() and
   * cleared only in stopWakeWord(). Because ref writes are synchronous, this
   * closes the gap where two armWakeWord() calls race across await boundaries
   * (e.g. a VAD state tick re-firing while engine.initialize() is in flight).
   */
  const wakeWordArmingRef = useRef(false);
  const wakeWordStoppingRef = useRef<Promise<void> | null>(null);
  const wakeWordGenerationRef = useRef(0);
  const wakeFailureRef = useRef(false);
  const stateRef = useRef<VoiceState>('IDLE');
  const transcriptRef = useRef('');
  const shouldListenRef = useRef(false);
  const streamingRef = useRef(false);
  const audioFrameCountRef = useRef(0);
  /**
   * Pre-roll ring buffer: holds the last N resampled PCM frames (~800ms)
   * captured while the session is armed but VAD has not yet fired SPEECH
   * START. Flushed to the socket the instant speech begins so short opening
   * words ("Hi", "Hey") and the start of longer phrases are never clipped
   * by VAD detection lag.
   */
  const PRE_ROLL_FRAME_COUNT = 25;
  const preRollBufferRef = useRef<Float32Array[]>([]);
  const onResultRef = useRef<(text: string) => Promise<string | void> | string | void>(onResult);
  const isUnmountedRef = useRef(false);
  const vadRef = useRef<any>(null);
  const microphoneRef = useRef<MicrophoneLease | null>(null);
  const conversationRequestedRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const vadStartingRef = useRef<Promise<void> | null>(null);
  const vadPausingRef = useRef<Promise<void> | null>(null);
  const streamsRef = useRef(new Set<MediaStream>());
  const captureStartRef = useRef<AbortController | null>(null);
  const preparedStreamRef = useRef<MediaStream | null>(null);
  const releaseConversationRef = useRef<() => Promise<void>>(async () => {});
  /**
   * True while TTS audio is being synthesized or played back. While set,
   * MicVAD speech-start events are IGNORED — the assistant's own voice
   * through the speaker triggers VAD otherwise (echo/self-triggering).
   * Users barge in via the explicit cancelPlayback() UI control instead.
   */
  const isTTSPlayingRef = useRef(false);
  const processingAudioRef = useRef<ProcessingAudio | null>(null);
  processingAudioRef.current ??= new ProcessingAudio();
  const stopProcessingAudio = useCallback(() => processingAudioRef.current?.stop(), []);
  onResultRef.current = onResult;
  
  const silenceTimerRef = useRef<number | undefined>(undefined);
  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef = useRef<() => void>(() => {});
  const clearSilenceTimer = useCallback(() => {
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = undefined;
  }, []);
  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    const generation = sessionGenerationRef.current;
    silenceTimerRef.current = window.setTimeout(() => {
      if (generation !== sessionGenerationRef.current || isUnmountedRef.current || stateRef.current !== 'LISTENING') return;
      stopRef.current();
      optionsRef.current.onSessionEnded?.();
    }, 4000);
  }, [clearSilenceTimer]);

  const updateState = useCallback((nextState: VoiceState) => {
    if (isUnmountedRef.current) return;
    if (nextState !== 'LISTENING') clearSilenceTimer();
    else if (stateRef.current !== 'LISTENING') armSilenceTimer();
    stateRef.current = nextState;
    setState(nextState);
  }, [armSilenceTimer, clearSilenceTimer]);

  const updateTranscript = useCallback((nextTranscript: string) => {
    if (isUnmountedRef.current) return;
    transcriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
  }, []);

  const bargeIn = useCallback(() => {
    if (typeof window === 'undefined' || isUnmountedRef.current) return;
    window.speechSynthesis?.cancel();
    const voiceWindow = window as VoiceWindow;
    voiceWindow.__airaVoiceAudioSources__?.forEach((source) => {
      try { source.stop(); } catch { /* source already stopped */ }
    });
    voiceWindow.__airaVoiceAudioSources__?.clear();
    voiceWindow.__airaVoiceAudioContexts__?.forEach((context) => {
      if (context.state === 'running') void context.suspend();
    });
  }, []);

  const stopWakeWord = useCallback(async () => {
    ++wakeWordGenerationRef.current;
    const listener = wakeWordRef.current;
    if (!listener) {
      // Nothing armed (or teardown already in progress) — do NOT call
      // listener.stop() on a service that another flow is still initializing;
      // that was causing WakeWordEngine.initialize() to be cancelled midway.
      wakeWordServiceRef.current = null;
      wakeWordArmingRef.current = false;
      setWakeWordEnabled(false);
      await wakeWordStoppingRef.current;
      return;
    }
    wakeWordRef.current = null;
    wakeWordServiceRef.current = null;
    // Release the synchronous arming lock so a future armWakeWord() can run.
    wakeWordArmingRef.current = false;
    setWakeWordEnabled(false);
    const stopping = listener.stop();
    wakeWordStoppingRef.current = stopping;
    try { await stopping; }
    finally { if (wakeWordStoppingRef.current === stopping) wakeWordStoppingRef.current = null; }
  }, []);

  const pauseVad = useCallback(async () => {
    clearSilenceTimer();
    captureStartRef.current?.abort();
    if (vadPausingRef.current) return vadPausingRef.current;
    const pending = (async () => {
      try { await vadStartingRef.current; } catch { /* failed startup still needs cleanup */ }
      try { await vadRef.current?.pause(); }
      finally {
        streamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
        streamsRef.current.clear();
      }
    })();
    vadPausingRef.current = pending;
    try { await pending; }
    finally { if (vadPausingRef.current === pending) vadPausingRef.current = null; }
  }, [clearSilenceTimer]);

  const releaseConversation = useCallback(async () => {
    const lease = microphoneRef.current;
    try { await pauseVad(); }
    finally {
      // pauseVad's finally has already stopped every tracked capture track.
      if (microphoneRef.current === lease) microphoneRef.current = null;
      lease?.release();
    }
  }, [pauseVad]);
  releaseConversationRef.current = releaseConversation;

  const startVad = useCallback(async () => {
    if (vadStartingRef.current) return vadStartingRef.current;
    const generation = sessionGenerationRef.current;
    const capture = new AbortController();
    captureStartRef.current = capture;
    const valid = () => !capture.signal.aborted && generation === sessionGenerationRef.current
      && Boolean(microphoneRef.current?.isCurrent()) && conversationRequestedRef.current && !isUnmountedRef.current;
    const pending = (async () => {
      await vadPausingRef.current;
      const deadline = Date.now() + 15000;
      while (vadRef.current?.loading && valid() && Date.now() < deadline) {
        await new Promise<void>(resolve => setTimeout(resolve, 50));
      }
      if (!valid()) throw audioCancelled();
      if (!vadRef.current || vadRef.current.loading || vadRef.current.errored) throw new Error('Microphone preparation failed. Tap the mic to retry.');

      // Permission and capture can outlive the WebView foreground session. Open
      // them before entering MicVAD, which cannot retry a canceled first start.
      const canceled = new Promise<never>((_, reject) => {
        capture.signal.addEventListener('abort', () => reject(audioCancelled()), { once: true });
      });
      const captureStarted = performance.now();
      const stream = await Promise.race([
        openBrowserMicrophone({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }, valid),
        canceled,
      ]);
      if (!valid()) {
        stream.getTracks().forEach(track => track.stop());
        throw audioCancelled();
      }
      console.info('[VoiceTiming] microphone-capture-ms', Math.round(performance.now() - captureStarted));
      streamsRef.current.add(stream);
      preparedStreamRef.current = stream;
      try {
        const vadStarted = performance.now();
        await vadRef.current.start();
        console.info('[VoiceTiming] vad-start-ms', Math.round(performance.now() - vadStarted));
      }
      finally {
        if (preparedStreamRef.current === stream) {
          preparedStreamRef.current = null;
          streamsRef.current.delete(stream);
          stream.getTracks().forEach(track => track.stop());
        }
      }
    })();
    vadStartingRef.current = pending;
    try { await pending; }
    finally {
      if (captureStartRef.current === capture) captureStartRef.current = null;
      if (vadStartingRef.current === pending) vadStartingRef.current = null;
    }
  }, []);

  const acquireConversation = useCallback(async (generation: number) => {
    const valid = () => generation === sessionGenerationRef.current && !isUnmountedRef.current && conversationRequestedRef.current && !document.hidden;
    await stopWakeWord();
    if (!valid()) throw audioCancelled();
    const lease = await browserMicrophone.acquire('conversation', async () => {
      if (sessionGenerationRef.current === generation) {
        ++sessionGenerationRef.current;
        conversationRequestedRef.current = false;
      }
      shouldListenRef.current = false;
      streamingRef.current = false;
      ttsService.stopCurrentAudio();
      socketRef.current?.disconnect();
      await releaseConversation();
      updateState('IDLE');
    }, valid);
    if (!lease || !valid()) { lease?.release(); throw audioCancelled(); }
    microphoneRef.current = lease;
  }, [releaseConversation, stopWakeWord, updateState]);

  const playChime = useCallback(() => {
    if (isUnmountedRef.current) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(720, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.19);
    oscillator.onended = () => { void context.close(); };
  }, []);

  const createSocket = useCallback(async (): Promise<void> => {
    const generation = sessionGenerationRef.current;
    if (isUnmountedRef.current) return;

    const existing = socketRef.current;
    const existingState = existing?.getState();

    console.log('🔵 createSocket() called', {
      existingState,
      existingOpen: existing?.isConnected() ?? false,
    });

    if (existing?.isConnected()) {
      console.log('🔵 [VoiceAssistant] Existing socket is already OPEN — reusing');
      return;
    }

    if (existingState === 'CONNECTING') {
      try {
        await existing!.whenConnected(8000);
        return;
      } catch (error) {
        if (generation !== sessionGenerationRef.current || isUnmountedRef.current) throw audioCancelled();
        console.warn('⚠️ [VoiceAssistant] Existing socket failed to open:', error);
        existing?.disconnect();
        socketRef.current = null;
      }
    }

    if (existing) {
      try {
        existing.disconnect();
      } catch {
        // ignore stale socket cleanup
      }
      socketRef.current = null;
    }

    const endpoint = new URL(process.env.REACT_APP_GEMINI_STT_URL || DEFAULT_STT_URL, window.location.origin);
    endpoint.searchParams.set('language', _lang);
    const url = endpoint.toString();

    // Dev proxy quirk: http-proxy-middleware only subscribes to `upgrade` events on its
    // first regular HTTP request, so a cold WebSocket connect hangs until timeout.
    // A HEAD through the same path registers the handler first. No-op in production.
    if (process.env.NODE_ENV === 'development') {
      try {
        await fetch(url.replace(/^ws/, 'http'), { method: 'HEAD' });
      } catch {
        // best-effort warm-up; socket connect has its own error handling
      }
    }
    if (generation !== sessionGenerationRef.current || isUnmountedRef.current) throw audioCancelled();

    console.log('🔵 [VoiceAssistant] Creating Gemini speech transport', {
      url,
      userId: authRef.current.userId,
      companyId: authRef.current.companyId,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        safeReject(new Error('Speech service connection timed out.'));
        socket.disconnect();
      }, 6000);

      const safeResolve = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve();
      };

      const safeReject = (error: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      };

      const socket = new GeminiVoiceSocket({
        url,
        sampleRate: SAMPLE_RATE,
        auth: {
          userId: authRef.current.userId,
          companyId: authRef.current.companyId,
        },
        onTranscript: (event) => {
          if (isUnmountedRef.current) return;
          if (!microphoneRef.current?.isCurrent()) return;

          console.log('📝 [STT] Transcript event received:', event);

          if (event.transcript) {
            updateTranscript(event.transcript);
          }

          if (event.isFinal) {
            streamingRef.current = false;
            shouldListenRef.current = false;
            setDone(true);
            updateState('PROCESSING');
            const finalText = event.transcript?.trim() || '';
            processingAudioRef.current?.start(requestedLanguage(finalText, _lang));
            const generation = sessionGenerationRef.current;
            const current = () => generation === sessionGenerationRef.current && !isUnmountedRef.current && Boolean(microphoneRef.current?.isCurrent());

            void (async () => {
              try {
                await pauseVad();
                if (!current()) return;
                console.log('📤 [STT] Sending final transcript to assistant:', finalText);
                const requestedAt = performance.now();
                const result = await onResultRef.current(finalText);
                console.info('[VoiceTiming] assistant-response-ms', Math.round(performance.now() - requestedAt));
                if (!current()) return;

                updateTranscript('');

                let replyText: string | undefined;
                if (typeof result === 'string') {
                  replyText = result;
                } else if (result !== undefined && result !== null) {
                  replyText = String(result);
                }

                if (replyText && replyText.trim().length > 0) {
                  try {
                    isTTSPlayingRef.current = true;
                    updateState('SYNTHESIZING');

                    await playTTS(
                      replyText,
                      () => { stopProcessingAudio(); if (current()) updateState('SPEAKING'); },
                      {
                        userId: authRef.current.userId,
                        companyId: authRef.current.companyId,
                      },
                    );
                  } catch (ttsError) {
                    console.error('❌ [TTS] Failed to play response:', ttsError);
                  } finally {
                    isTTSPlayingRef.current = false;
                  }
                }
                stopProcessingAudio();
                if (!current()) return;

                updateState('IDLE');

                if (optionsRef.current.isSessionActive?.()) {
                  void resumeListeningRef.current();
                } else {
                  conversationRequestedRef.current = false;
                  await releaseConversationRef.current();
                  void armWakeWordRef.current();
                }
              } catch (error) {
                stopProcessingAudio();
                if (!current()) return;
                conversationRequestedRef.current = false;
                await releaseConversationRef.current();
                console.error('❌ [STT] Error processing final transcript:', {
                  error,
                  requestId: error instanceof AssistantError ? error.requestId : undefined,
                });
                updateState('ERROR');
                setErrorMessage(assistantErrorMessage(error));
              }
            })();
          }
        },
        onError: (message) => {
          if (isUnmountedRef.current) return;
          console.error('🔴 [VoiceAssistant] VoiceSocket error:', message);
          if (settled) {
            setErrorMessage('Voice connection paused — Tap to reconnect');
            updateState('ERROR');
          }
          safeReject(new Error(message));
        },
        onStateChange: (socketState) => {
          if (isUnmountedRef.current) return;

          console.log('🔌 [VoiceAssistant] Socket state:', socketState);

          if (socketState === 'CONNECTED') {
            setErrorMessage(null);
            safeResolve();
          } else if (socketState === 'RECONNECTING' && settled) {
            setErrorMessage('Reconnecting voice...');
          } else if (socketState === 'ERROR' || socketState === 'DISCONNECTED') {
            safeReject(new Error('Speech WebSocket disconnected'));
          }
        },
      });

      socketRef.current = socket;
      socket.connect();
    });
  }, [_lang, pauseVad, updateState, updateTranscript]);

  /**
   * Strict handshake gate: guarantees the STT WebSocket is fully OPEN
   * (readyState === 1) before resolving. Unlike VoiceSocket.whenConnected()
   * — which resolves immediately on DISCONNECTED/ERROR — this polls the raw
   * readyState and gives up after a timeout so callers never begin VAD
   * capture against a half-open connection (the cause of clipped first
   * words / dropped audio).
   */
  const ensureSocketOpen = useCallback(async (timeoutMs = 8000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (isUnmountedRef.current) return false;

      if (socketRef.current?.isConnected()) {
        console.log('🟢 [VoiceAssistant] Socket confirmed OPEN (readyState === 1)');
        return true;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }

    console.error('🔴 [VoiceAssistant] Timed out waiting for WebSocket OPEN', {
      socketState: socketRef.current?.getState(),
    });

    return false;
  }, []);

  const getMicStream = useCallback(async () => {
    const stream = preparedStreamRef.current;
    if (!stream) throw audioCancelled();
    preparedStreamRef.current = null;
    return stream;
  }, []);
  
  //persistent refs for VAD callbacks to keep identity stable
  const onSpeechStartRef = useRef(() => {});
  const onFrameProcessedRef = useRef((_probabilities: any, _frame: Float32Array) => {});
  const onSpeechEndRef = useRef(() => {});

  /**
   * Drains the pre-roll ring buffer to the speech transport in capture order.
   */
  const flushPreRoll = useCallback(() => {
    const buffered = preRollBufferRef.current;
    preRollBufferRef.current = [];
    if (buffered.length > 0 && socketRef.current) {
      console.log('⏪ [VAD] Flushing pre-roll buffer', {
        frames: buffered.length,
        approxMs: Math.round(
          (buffered.reduce((sum, frame) => sum + frame.length, 0) / SAMPLE_RATE) * 1000,
        ),
      });
      for (const frame of buffered) {
        socketRef.current.sendAudioChunk(frame);
      }
    }
  }, []);

  // Keep callback refs updated with the latest logic on each render cycle
  onSpeechStartRef.current = () => {
    if (isUnmountedRef.current) return;
    audioFrameCountRef.current = 0;
    console.log('🎤 [VAD] SPEECH START', {
      shouldListen: shouldListenRef.current,
      streamingBefore: streamingRef.current,
      socketState: socketRef.current?.getState(),
    });

    if (!shouldListenRef.current) {
      console.log('⚠️ [VAD] Speech started but listening is disabled');
      return;
    }

    // Suppress VAD self-triggering: while TTS audio is playing, the
    // assistant's own speaker output trips the mic's speech detector.
    // Barge-in during playback is manual-only via cancelPlayback().
    if (isTTSPlayingRef.current) {
      console.log('🔇 [VAD] Speech start ignored — TTS audio output active (use manual cancel to barge in)');
      return;
    }
    clearSilenceTimer();

    // Stop any currently playing TTS when user starts speaking
    ttsService.stopCurrentAudio();

    bargeIn();

    // SOCKET GATE: the server may have closed the socket (code 1000) between
    // turns. If it's missing or not OPEN when speech begins, re-open it and
    // wait for a strictly OPEN readyState BEFORE flushing pre-roll, so the
    // opening words are buffered/queued rather than dropped.
    if (!socketRef.current || !socketRef.current.isConnected()) {
      console.log('🔄 [VAD] Socket closed before speech start — re-opening socket...');
      const generation = sessionGenerationRef.current;
      void (async () => {
        try {
          await createSocket();
          const open = await ensureSocketOpen();
          if (!open || generation !== sessionGenerationRef.current || !shouldListenRef.current || isUnmountedRef.current) {
            console.error('🔴 [VAD] Could not re-open socket for active utterance');
            return;
          }
          flushPreRoll();
          streamingRef.current = true;
          updateState('LISTENING');
          console.log('🎤 [VAD] NOW STREAMING AUDIO (after socket re-open)');
        } catch (error) {
          console.error('🔴 [VAD] Socket re-open during speech failed:', error);
        }
      })();
      return;
    }

    // PRE-ROLL FLUSH: VAD fired ~200-300ms after the user actually started
    // speaking. Drain the ring buffer of pre-speech frames to the socket
    // FIRST, in capture order, before any live frames are streamed.
    flushPreRoll();

    streamingRef.current = true;
    updateState('LISTENING');

    console.log('🎤 [VAD] NOW STREAMING AUDIO');
  };

  onFrameProcessedRef.current = (_probabilities: any, frame: Float32Array) => {
    if (isUnmountedRef.current) return;
    audioFrameCountRef.current += 1;
    if (
      audioFrameCountRef.current === 1 ||
      audioFrameCountRef.current % 25 === 0
    ) {
      console.log('🎵 [VAD:FRAME]', {
        frameNumber: audioFrameCountRef.current,
        samples: frame.length,
        shouldListen: shouldListenRef.current,
        streaming: streamingRef.current,
        socketState: socketRef.current?.getState(),
      });
    }
    if (shouldListenRef.current && socketRef.current) {
      const audioFrame = resampleTo16k(frame, SAMPLE_RATE);

      if (streamingRef.current) {
        // Buffer live frames for Gemini transcription at utterance end.
        socketRef.current.sendAudioChunk(audioFrame);
      } else {
        // Session armed but speech not yet detected: keep a rolling window
        // of the last N frames as pre-roll for the next SPEECH START.
        const buffer = preRollBufferRef.current;
        buffer.push(audioFrame);
        while (buffer.length > PRE_ROLL_FRAME_COUNT) {
          buffer.shift();
        }
      }
    }
  };

  onSpeechEndRef.current = () => {
    if (isUnmountedRef.current) return;
    console.log('🛑 [VAD] SPEECH END', {
      streaming: streamingRef.current,
      shouldListen: shouldListenRef.current,
      socketState: socketRef.current?.getState(),
      transcript: transcriptRef.current,
    });

    if (!streamingRef.current) {
      console.log('⚠️ [VAD] Speech end ignored - was not streaming');
      return;
    }

    streamingRef.current = false;
    shouldListenRef.current = false;
    preRollBufferRef.current = [];

    console.log('🛑 [VAD] Stopped sending audio, ending utterance');

    socketRef.current?.endUtterance();
    // Safely pause VAD via the ref
    try {
      console.log('⏸️ [VAD] Pausing VAD instance after speech end');
      void pauseVad().catch(error => console.warn('VAD pause failed', error));
    } catch (err) {
      console.warn('⚠️ Could not pause VAD:', err);
    }
    updateState('PROCESSING');
  };
  //Pass stable useCallback wrappers into useMicVAD
  console.log('🧠 [VAD:LIFECYCLE] Creating useMicVAD instance [build: local-vad-v100]', {
    iosApp: isIosNativeApp(),
    flag: (window as any).__AIRA_IOS_APP__,
    rnWebView: Boolean((window as any).ReactNativeWebView),
  });
  const vad = useMicVAD({
    startOnLoad: false,
    model: 'v5',
    getStream: getMicStream,
    resumeStream: getMicStream,
    pauseStream: async (stream: MediaStream) => {
      stream.getTracks().forEach(track => track.stop());
      streamsRef.current.delete(stream);
    },
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: ONNX_WASM_PATH,
    ortConfig: configureVoiceRuntime,
    onSpeechStart: useCallback(() => onSpeechStartRef.current(), []),
    onFrameProcessed: useCallback((p: any, f: Float32Array) => onFrameProcessedRef.current(p, f), []),
    onSpeechEnd: useCallback(() => onSpeechEndRef.current(), []),
    onVADMisfire: useCallback(() => {
      streamingRef.current = false;
      if (shouldListenRef.current && stateRef.current === 'LISTENING') armSilenceTimer();
    }, [armSilenceTimer]),
  });
  // Keep vadRef in sync via effect so callback identities stay stable across
  // VAD state ticks (loading/listening changes re-render the hook).
  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  console.log('🧠 [VAD:STATE]:', {
    loading: vad.loading,
    listening: vad.listening,
    userSpeaking: vad.userSpeaking,
    errored: vad.errored,
  });
  
  // Late-bound reference so the gesture-retry helper can call armWakeWord
  // without a circular useCallback dependency.
  const armWakeWordRef = useRef<() => Promise<void>>(async () => {});
  // Late-bound reference so the long-lived STT socket callback can dispatch
  // to the latest multi-turn resume routine (avoids stale `vad` closures).
  const resumeListeningRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Browser autoplay/permission policy gate: getUserMedia for the background
   * wake-word listener is rejected with NotAllowedError until the user has
   * interacted with the page at least once. Register a one-shot listener on
   * common activation gestures so the wake word arms itself on first touch.
   */
  const armOnFirstGesture = useCallback((reason?: string) => {
    if (typeof window === 'undefined' || isUnmountedRef.current) return;
    console.log('🔒 [WakeWord] Mic blocked by browser policy — waiting for first user gesture', reason ?? '');
    const retry = () => {
      window.removeEventListener('click', retry);
      window.removeEventListener('touchend', retry);
      window.removeEventListener('keydown', retry);
      void armWakeWordRef.current();
    };
    window.addEventListener('click', retry, { once: true });
    window.addEventListener('touchend', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  }, []);

  const armWakeWord = useCallback(async () => {
    if (isUnmountedRef.current || wakeFailureRef.current || ttsService.playbackInterruption() || messagePlaybackActive() || !browserAudioReady()) return;
    // iOS app WebView: running the wake-word ONNX runtime next to the VAD
    // exhausts WASM memory. Use tap-to-talk there instead.
    if (isIosNativeApp()) {
      console.log('🟣 [WakeWord] Disabled inside the iOS app (tap-to-talk only)');
      return;
    }
    // Synchronous lock check — runs before ANY async setup. Prevents VAD
    // lifecycle ticks from re-entering while WakeWordEngine.initialize()
    // is still in flight (initializing: true).
    if (wakeWordArmingRef.current || wakeWordRef.current) {
      console.log('🟣 [WakeWord] armWakeWord skipped — initialization already in progress or armed');
      return;
    }
    if (!supported || shouldListenRef.current || conversationRequestedRef.current || document.hidden) return;
    if (browserMicrophone.mode && browserMicrophone.mode !== 'wake') return;
    if (wakeWordServiceRef.current) {
      console.log('🟣 [WakeWord] armWakeWord skipped — service instance still live');
      return;
    }
    // ROUTE GUARD: never arm the background wake-word listener on public
    // / unauthenticated routes. Requesting a mic stream before the user
    // has signed in surfaces a permission prompt with no chat surface
    // behind it, and the resulting "Hey Aira" trigger has nowhere to
    // navigate to. Late-bind through optionsRef so a route change that
    // happens while this callback is queued still observes the latest
    // pathname.
    const currentPath = optionsRef.current.currentPathname;
    if (currentPath !== undefined && isPublicRoute(currentPath)) {
      console.log('🚫 [WakeWord] Skipping wake word arming on public route:', currentPath);
      return;
    }
    wakeWordArmingRef.current = true;
    const generation = wakeWordGenerationRef.current;
    await wakeWordStoppingRef.current;
    if (generation !== wakeWordGenerationRef.current || isUnmountedRef.current || shouldListenRef.current) {
      wakeWordArmingRef.current = false;
      return;
    }
    console.log('🔍 [Debug] armWakeWord() function entered', {
      isUnmounted: isUnmountedRef.current,
      supported,
      alreadyArmed: Boolean(wakeWordRef.current),
      shouldListen: shouldListenRef.current,
    });
    const listener = new WakeWordService({
      keywordPath: WAKE_WORD_KEYWORD_PATH,
      modelPath: WAKE_WORD_MODEL_PATH,
      onStopped: () => {
        // Dictation can stop the service through the coordinator directly.
        if (wakeWordRef.current === listener) {
          wakeWordRef.current = null;
          wakeWordServiceRef.current = null;
          wakeWordArmingRef.current = false;
          if (!isUnmountedRef.current) setWakeWordEnabled(false);
        }
      },
      onWakeWord: () => {
        if (isUnmountedRef.current) return;
        if (shouldListenRef.current) return;
        conversationRequestedRef.current = true;
        const sessionGeneration = sessionGenerationRef.current;
        void (async () => {
          // Stop wake-word detection first so the mic track is released cleanly
          await stopWakeWord();
          if (sessionGeneration !== sessionGenerationRef.current || isUnmountedRef.current) return;
          playChime();

          // External owner (global VoiceAssistantContext) takes over from here:
          // it navigates to the chat surface and starts MicVAD itself.
          const externalHandler = optionsRef.current.onWakeWordDetected;
          if (externalHandler) {
            externalHandler();
            return;
          }

          await startRef.current();
        })();
      },
      onLevel: setAudioLevel,
      onError: (message) => {
        if (isUnmountedRef.current) return;
        wakeFailureRef.current = true;
        setErrorMessage(message);
        setWakeWordEnabled(false);
        void stopWakeWord();
      },
    });
    wakeWordRef.current = listener;
    wakeWordServiceRef.current = listener;
    try {
      await listener.start();
      if (wakeWordRef.current !== listener || generation !== wakeWordGenerationRef.current) return;
      // start() can return cleanly even when it was aborted mid-flight by a
      // stop() request (the abort path returns instead of throwing). Verify
      // the engine actually reached the active/listening state; if not, treat
      // as intentional cancellation, without a permission retry.
      if (!listener.isActive) {
        console.warn('🟣 [WakeWord] start() returned but engine is NOT active — treating as aborted');
        if (wakeWordRef.current === listener) wakeWordRef.current = null;
        wakeWordServiceRef.current = null;
        wakeWordArmingRef.current = false;
        setWakeWordEnabled(false);
        // Intentional teardown is not a browser permission failure.
        if (!browserMicrophone.mode && !conversationRequestedRef.current && !document.hidden) queueMicrotask(() => { void armWakeWordRef.current(); });
        return;
      }
      setWakeWordEnabled(true);
      console.log('🟢 [WakeWord] Wake word armed and listening for "Hey Aira"');
    } catch (error: unknown) {
      if (wakeWordRef.current !== listener || generation !== wakeWordGenerationRef.current) return;
      console.error('🔴 [WakeWord] armWakeWord caught error:', error);
      if (wakeWordRef.current === listener) wakeWordRef.current = null;
      wakeWordServiceRef.current = null;
      // Arming failed — release the lock so the gesture-retry can re-arm.
      wakeWordArmingRef.current = false;
      setWakeWordEnabled(false);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        // Browser autoplay/permission policy blocked background mic access
        // before any user gesture. Retry once on the first user interaction —
        // a click counts as a user activation, so getUserMedia will succeed.
        armOnFirstGesture(error.message);
      } else if (error instanceof Error) {
        wakeFailureRef.current = true;
        setErrorMessage(error.message);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armOnFirstGesture, playChime, stopWakeWord, supported]);

  // Keep the late-bound reference in sync after armWakeWord is defined.
  armWakeWordRef.current = armWakeWord;

  useEffect(() => {
    const unsubscribe = browserMicrophone.subscribe(() => {
      if (!conversationRequestedRef.current && !document.hidden && !isUnmountedRef.current) void armWakeWordRef.current();
    });
    const background = (event: Event) => {
      const interrupted = document.hidden || event.type === 'pagehide' || androidAudioBackgrounded();
      if (interrupted || messagePlaybackActive() || !browserAudioReady()) {
        const permissionLost = !interrupted && !browserAudioReady() && conversationRequestedRef.current;
        ++sessionGenerationRef.current;
        conversationRequestedRef.current = false;
        shouldListenRef.current = false;
        streamingRef.current = false;
        if (interrupted) {
          ttsService.pauseForBackground();
          streamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
        }
        socketRef.current?.disconnect();
        void stopWakeWord();
        void releaseConversation().catch(error => console.warn('Microphone release failed', error));
        if (permissionLost) {
          setErrorMessage('Allow microphone access in Android settings and try again.');
          updateState('ERROR');
        } else {
          updateState('IDLE');
        }
      } else { wakeFailureRef.current = false; void armWakeWordRef.current(); }
    };
    const playbackChanged = () => {
      if (!ttsService.playbackInterruption()) queueMicrotask(() => { void armWakeWordRef.current(); });
    };
    window.addEventListener(PLAYBACK_INTERRUPTION_EVENT, playbackChanged);
    window.addEventListener(MESSAGE_PLAYBACK_EVENT, background);
    window.addEventListener(ANDROID_AUDIO_EVENT, background);
    requestAndroidAudioState();
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', background);
    return () => {
      unsubscribe();
      window.removeEventListener(PLAYBACK_INTERRUPTION_EVENT, playbackChanged);
      window.removeEventListener(MESSAGE_PLAYBACK_EVENT, background);
      window.removeEventListener(ANDROID_AUDIO_EVENT, background);
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('pagehide', background);
    };
  }, [releaseConversation, stopWakeWord, updateState]);

  /**
   * Multi-turn continuation: called after a reply has been spoken while the
   * voice session is still active. Re-opens the STT socket (the server
   * closes it with code 1000 after each final transcript) and restarts
   * MicVAD so the user can simply keep talking — no wake word or button
   * press needed between turns.
   *
   * IMPORTANT: reads VAD state through vadRef (always the latest instance)
   * and WAITS for MicVAD to finish re-creating itself instead of bailing.
   * Bailing on vad.loading cleared shouldListenRef while the [VAD:READY]
   * effect raced ahead and started the mic with utterance capture disabled,
   * preventing the next transcript from being submitted.
   */
  const resumeListeningAfterTurn = useCallback(async () => {
    if (isUnmountedRef.current || !microphoneRef.current?.isCurrent()) return;
    const generation = sessionGenerationRef.current;
    console.log('🔁 [VoiceAssistant] Multi-turn: resuming listening for next utterance');
    shouldListenRef.current = true;
    streamingRef.current = false;
    setDone(false);
    setErrorMessage(null);
    updateTranscript('');
    updateState('IDLE');
    try {
      // Ensure the utterance transport is connected before listening again.
      if (!socketRef.current || !socketRef.current.isConnected()) {
        console.log('🔄 [MultiTurn] Speech transport disconnected — reconnecting');
        await createSocket();
      }
      if (generation !== sessionGenerationRef.current) return;
      const socketOpen = await ensureSocketOpen();
      if (generation !== sessionGenerationRef.current) return;
      if (!socketOpen || isUnmountedRef.current || !optionsRef.current.isSessionActive?.()) {
        console.error('🔴 [MultiTurn] Aborting resume — no OPEN socket or session ended');
        shouldListenRef.current = false;
        updateState('IDLE');
        conversationRequestedRef.current = false;
        void releaseConversation().then(() => armWakeWord());
        return;
      }

      // MicVAD tears down / re-creates its internal instance after each
      // turn's pause(), so vad.loading is frequently TRUE right here.
      // Poll until the fresh instance is ready (max 5s) rather than bailing.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (isUnmountedRef.current || generation !== sessionGenerationRef.current) return;
        const currentVad = vadRef.current;
        if (currentVad && !currentVad.loading && !currentVad.errored) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }

      // Re-check the session gate — the user may have exited while polling.
      if (!optionsRef.current.isSessionActive?.()) {
        console.log('🛑 [MultiTurn] Session ended while waiting for VAD — falling back to wake word');
        shouldListenRef.current = false;
        updateState('IDLE');
        conversationRequestedRef.current = false;
        void releaseConversation().then(() => armWakeWord());
        return;
      }

      const currentVad = vadRef.current;
      if (currentVad && !currentVad.loading && !currentVad.errored) {
        if (!currentVad.listening) {
          console.log('🟢 [MultiTurn] Restarting MicVAD for next turn');
          await startVad();
        } else {
          console.log('🟢 [MultiTurn] MicVAD already listening — continuing session');
        }
        if (generation !== sessionGenerationRef.current) return;
        updateState('LISTENING');
        console.log('🟢 [MultiTurn] Session continues — listening for next utterance');
      } else {
        console.log('⏳ [MultiTurn] VAD failed to become ready — deferring to wake word');
        shouldListenRef.current = false;
        updateState('IDLE');
        conversationRequestedRef.current = false;
        void releaseConversation().then(() => armWakeWord());
      }
    } catch (error) {
      if (generation !== sessionGenerationRef.current) return;
      console.error('🔴 [MultiTurn] Failed to resume listening:', error);
      shouldListenRef.current = false;
      updateState('IDLE');
      conversationRequestedRef.current = false;
        void releaseConversation().then(() => armWakeWord());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armWakeWord, createSocket, ensureSocketOpen, releaseConversation, startVad, updateState, updateTranscript]);

  // Late-bound dispatch: the STT socket's final-transcript callback lives in
  // a long-lived closure, so it must reach the LATEST resume routine.
  resumeListeningRef.current = resumeListeningAfterTurn;

  /**
   * Explicit manual barge-in: the user taps the stop/cancel control while
   * AIRA is speaking. Halts TTS immediately and clears the mic-suppression
   * window so VAD can pick up the user's next utterance right away.
   * Unlike VAD auto-barge-in, this works even during playback (when
   * speech-start events are suppressed by isTTSPlayingRef).
   */
  const cancelPlayback = useCallback(() => {
    if (isUnmountedRef.current) return;
    console.log('🛑 [VoiceAssistant] Manual barge-in requested — stopping TTS');
    // Clear the suppression flag FIRST so VAD is re-enabled immediately.
    isTTSPlayingRef.current = false;
    ttsService.stopCurrentAudio();
    const voiceWindow = window as VoiceWindow;
    voiceWindow.__airaVoiceAudioSources__?.forEach((src) => {
      try { src.stop(); } catch { /* source already stopped */ }
    });
    voiceWindow.__airaVoiceAudioSources__?.clear();
    window.speechSynthesis?.cancel();
  }, []);

  const start = useCallback(async () => {
    if (isUnmountedRef.current) return;
    if (document.hidden || !browserAudioReady()) {
      updateState('ERROR');
      setErrorMessage('Allow microphone access in Android settings and return to the app to use voice.');
      return;
    }
    if (messagePlaybackActive()) stopMessagePlayback();
    else if (ttsService.playbackInterruption()) ttsService.stopCurrentAudio();
    const activationStarted = performance.now();
    console.log('🎙️ [VoiceAssistant] START called');

    if (!supported) {
      console.error('❌ [VoiceAssistant] Voice is not supported');
      return;
    }
    const generation = ++sessionGenerationRef.current;
    wakeFailureRef.current = false;
    conversationRequestedRef.current = true;
    shouldListenRef.current = false;
    streamingRef.current = false;
    setDone(false);
    setErrorMessage(null);
    updateTranscript('');
    updateState('IDLE');

    const timer = window.setTimeout(() => {
      if (generation !== sessionGenerationRef.current || isUnmountedRef.current) return;
      ++sessionGenerationRef.current;
      conversationRequestedRef.current = false;
      shouldListenRef.current = false;
      streamingRef.current = false;
      socketRef.current?.disconnect();
      streamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()));
      void releaseConversation().catch(error => console.warn('Microphone release failed', error));
      setErrorMessage('Microphone preparation timed out. Tap the mic to retry.');
      updateState('ERROR');
    }, 15000);
    try {
      await acquireConversation(generation);
      console.info('[VoiceTiming] microphone-handoff-ms', Math.round(performance.now() - activationStarted));
      const current = () => generation === sessionGenerationRef.current && Boolean(microphoneRef.current?.isCurrent()) && !isUnmountedRef.current;
      preRollBufferRef.current = [];
      const connectSpeech = async () => {
        const started = performance.now();
        for (let attempt = 0; attempt < 2 && current(); attempt += 1) {
          try {
            await createSocket();
            if (!current()) return;
            if (socketRef.current?.isConnected()) {
              console.info('[VoiceTiming] speech-connection-ms', Math.round(performance.now() - started));
              return;
            }
          } catch (error) {
            if (!current()) return;
            console.warn('Speech service connection attempt failed', error);
          }
          socketRef.current?.disconnect();
          socketRef.current = null;
        }
        if (current()) throw new Error('Could not connect to the speech service. Please try again.');
      };

      // Warm up capture and transport together. VAD callbacks cannot send
      // audio until both are ready and the listening UI is shown.
      await Promise.all([startVad(), connectSpeech()]);
      if (!current()) return;
      if (!socketRef.current?.isConnected()) throw new Error('Speech service disconnected. Please try again.');
      shouldListenRef.current = true;
      updateState('LISTENING');
      console.info('[VoiceTiming] activation-ready-ms', Math.round(performance.now() - activationStarted));
    } catch (error) {
      if (generation !== sessionGenerationRef.current || isUnmountedRef.current) return;
      ++sessionGenerationRef.current;
      conversationRequestedRef.current = false;
      shouldListenRef.current = false;
      streamingRef.current = false;
      socketRef.current?.disconnect();
      void releaseConversation().catch(reason => console.warn('Microphone release failed', reason));
      setErrorMessage(error instanceof Error && ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name)
        ? 'Microphone access is blocked. Enable microphone permission in your browser settings to use voice.'
        : error instanceof Error ? error.message : 'Unable to start microphone.');
      updateState('ERROR');
    } finally {
      window.clearTimeout(timer);
    }
  }, [
    acquireConversation,
    createSocket,
    releaseConversation,
    startVad,
    supported,
    updateState,
    updateTranscript,
  ]);

  startRef.current = start;

  const stop = useCallback(() => {
    if (isUnmountedRef.current) return;
    const generation = ++sessionGenerationRef.current;
    conversationRequestedRef.current = false;
    shouldListenRef.current = false;
    streamingRef.current = false;
    preRollBufferRef.current = [];
    // Only pause if VAD is loaded and listening
    if (!vad.loading && !vad.errored) {
      try {
        void pauseVad().catch(error => console.warn('VAD pause failed', error));
      } catch (err) {
        console.warn('VAD pause ignored:', err);
      }
    }
    socketRef.current?.endUtterance();
    socketRef.current?.disconnect();
    if (transcriptRef.current.trim()) setDone(true);
    updateState('IDLE');
    stopProcessingAudio();
    ttsService.stopCurrentAudio();
    void releaseConversation().then(() => { if (generation === sessionGenerationRef.current) void armWakeWord(); }).catch(error => setErrorMessage(String(error)));
  }, [armWakeWord, pauseVad, releaseConversation, updateState, vad]);
  stopRef.current = stop;

  const cancel = useCallback(() => {
    if (isUnmountedRef.current) return;
    const generation = ++sessionGenerationRef.current;
    conversationRequestedRef.current = false;
    shouldListenRef.current = false;
    streamingRef.current = false;
    preRollBufferRef.current = [];
    // Only pause if VAD is loaded and listening
    if (!vad.loading && !vad.errored) {
      try {
        void pauseVad().catch(error => console.warn('VAD pause failed', error));
      } catch (err) {
        console.warn('VAD pause ignored:', err);
      }
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    updateTranscript('');
    setDone(false);
    setErrorMessage(null);
    updateState('IDLE');
    stopProcessingAudio();
    ttsService.stopCurrentAudio();
    void releaseConversation().then(() => { if (generation === sessionGenerationRef.current) void armWakeWord(); }).catch(error => setErrorMessage(String(error)));
  }, [armWakeWord, pauseVad, releaseConversation, updateState, updateTranscript, vad]);

  const accept = useCallback(async (textOverride?: string) => {
    if (isUnmountedRef.current || !microphoneRef.current?.isCurrent()) return;
    const text = (textOverride ?? transcriptRef.current).trim();
    if (!text || stateRef.current === 'PROCESSING') return;
    shouldListenRef.current = false;
    streamingRef.current = false;
    // Only pause if VAD is loaded and listening
    if (!vad.loading && !vad.errored) {
      try {
        await pauseVad();
      } catch (err) {
        console.warn('VAD pause ignored:', err);
      }
    }
    socketRef.current?.disconnect();
    const generation = sessionGenerationRef.current;
    updateState('PROCESSING');
    setDone(false);
    try {
      await onResultRef.current(text);
      if (generation !== sessionGenerationRef.current || isUnmountedRef.current) return;
      updateTranscript('');
      updateState('IDLE');
      conversationRequestedRef.current = false;
      await releaseConversation();
      void armWakeWord();
    } catch (error: unknown) {
      if (generation !== sessionGenerationRef.current || isUnmountedRef.current) return;
      conversationRequestedRef.current = false;
      await releaseConversation();
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send voice message.');
      updateState('ERROR');
    }
  }, [armWakeWord, pauseVad, releaseConversation, updateState, updateTranscript, vad]);

  useEffect(() => {
    console.log('🔍 [Debug] Isolated WakeWord mount effect running');
    // ROUTE GUARD: the wake-word listener must NOT arm on public /
    // unauthenticated routes. Skip the initial arm attempt here and let
    // the route-watcher effect (below) re-evaluate whenever the
    // pathname changes.
    const currentPath = optionsRef.current.currentPathname;
    if (currentPath !== undefined && isPublicRoute(currentPath)) {
      console.log('🚫 [WakeWord] Skipping initial arm on public route:', currentPath);
    } else {
      void armWakeWord();
    }

    return () => {
      // Runs strictly ONCE on mount (empty deps) — never re-fires on VAD
      // state ticks. The isUnmountedRef check distinguishes a true DOM
      // unmount from React StrictMode's dev-only double-invocation.
      if (isUnmountedRef.current) {
        console.log('🔴 [VoiceAssistant] True DOM unmount — stopping wake word');
        wakeWordArmingRef.current = false;
        void stopWakeWord();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Route-change watcher. Re-evaluates the public-route allowlist every
   * time the pathname changes and either disarms the wake-word listener
   * (on public routes — releases the mic immediately so logout /
   * navigation to /login doesn't leave a stream open) or arms it (on
   * protected routes — the listener is normally kept hot by stop() and
   * accept() but they no-op if it is already armed, so we just call
   * armWakeWord() and let the synchronous lock short-circuit it).
   */
  useEffect(() => {
    const currentPath = optionsRef.current.currentPathname;
    const previousPath = previousPathRef.current;
    previousPathRef.current = currentPath;
    if (currentPath === undefined) return;
    if (previousPath === '/chat-bot' && currentPath !== previousPath && conversationRequestedRef.current) {
      stopRef.current();
      optionsRef.current.onSessionEnded?.();
    }
    if (isPublicRoute(currentPath)) {
      console.log('🚫 [WakeWord] Route changed to public — tearing down listener:', currentPath);
      ++sessionGenerationRef.current;
      conversationRequestedRef.current = false;
      shouldListenRef.current = false;
      streamingRef.current = false;
      ttsService.stopCurrentAudio();
      socketRef.current?.disconnect();
      void releaseConversation().catch(error => console.warn('Microphone release failed', error));
      // Release the mic stream NOW, not lazily on the next turn. Force
      // the sync lock back to false so a future re-arm on a protected
      // route is not blocked.
      wakeWordArmingRef.current = false;
      void stopWakeWord();
      return;
    }
    // Protected route — make sure the listener is armed. armWakeWord()
    // is idempotent and bails early if already armed or arming.
    if (!wakeWordRef.current && !wakeWordArmingRef.current) {
      console.log('🟢 [WakeWord] Route changed to protected — arming listener:', currentPath);
      void armWakeWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsRef.current.currentPathname]);

  useEffect(() => {
    console.log('🧠 [VAD] Error state changed:', vad.errored);

    if (vad.errored && shouldListenRef.current) {
      console.error('🔴 [VAD] ERROR:', vad.errored);
      setErrorMessage(vad.errored);
      updateState('ERROR');
    }
  }, [updateState, vad.errored]);

  useEffect(() => {
    console.log('🧠 [VAD] Listening state changed:', vad.listening);
  }, [vad.listening]);

  useEffect(() => {
    console.log('🟢 [VoiceAssistant] COMPONENT MOUNTED');

    // Mark component as mounted
    isUnmountedRef.current = false;

    return () => {
      // NOTE: This app does not wrap the tree in <StrictMode>, so this
      // cleanup only ever runs on a REAL unmount (route teardown / page
      // close / HMR edit). No deferred-timer machinery is needed.
      console.log('🔴 [VoiceAssistant] COMPONENT UNMOUNTED');
      isUnmountedRef.current = true;
      stopProcessingAudio();
      // This cancellation counter intentionally uses its latest value at teardown.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++sessionGenerationRef.current;
      conversationRequestedRef.current = false;
      shouldListenRef.current = false;
      streamingRef.current = false;
      // Prevent MicVAD null stream crash on rapid unmount: only pause when
      // the instance finished initializing; never destroy mid-setup, since
      // the library's internal cleanup throws
      // "MicVAD has null stream, audio context, or processor adapter"
      // when teardown races an in-flight async init.
      try {
        void releaseConversation().catch(error => console.warn('Microphone release failed', error));
      } catch (err) {
        console.warn('⚠️ Ignored MicVAD unmount teardown error:', err);
      }
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (error) {
          console.warn('Error disconnecting socket during unmount:', error);
        }
        socketRef.current = null;
      }
      void stopWakeWord();
    };
  }, [releaseConversation, stopWakeWord]);

  return {
    supported,
    wakeWordEnabled,
    state,
    listening: state === 'LISTENING',
    processing: state === 'PROCESSING',
    transcript,
    done,
    errorMessage,
    audioLevel,
    start,
    stop,
    cancel,
    accept,
    cancelPlayback,
  };
}

function resampleTo16k(samples: Float32Array, sourceSampleRate: number): Float32Array {
  if (sourceSampleRate === SAMPLE_RATE) return samples;
  const targetLength = Math.round(samples.length * SAMPLE_RATE / sourceSampleRate);
  const output = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * SAMPLE_RATE / sourceSampleRate;
    const before = Math.floor(sourceIndex);
    const after = Math.min(before + 1, samples.length - 1);
    output[index] = samples[before] * (1 - (sourceIndex - before)) + samples[after] * (sourceIndex - before);
  }
  return output;
}
