import { useMicVAD } from '@ricky0123/vad-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceState } from '../types';
import { VoiceSocket } from '../services/voiceSocket';
import { WakeWordService } from '../services/wakeWordService';
import { isVoiceSupported } from '../utils/voiceSupport';
import { isPublicRoute } from '../utils/publicRoutes';
import { playTTS, ttsService } from '../services/ttsService';
import { getAuthContext, type AuthParams } from '../utils/useAuth';

const SAMPLE_RATE = 16000;
const VAD_ASSET_PATH = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/';
const ONNX_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const DEFAULT_STT_URL = 'wss://n8ncustomer.air2o.net/ws/stt';
const WAKE_WORD_KEYWORD_PATH = process.env.REACT_APP_OPENWAKEWORD_KEYWORD_PATH || '/openwakeword/models/hey_aira.onnx';
const WAKE_WORD_MODEL_PATH = process.env.REACT_APP_OPENWAKEWORD_MODEL_PATH || '/openwakeword/models/';

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

  const socketRef = useRef<VoiceSocket | null>(null);
  const wakeWordRef = useRef<WakeWordService | null>(null);
  const wakeWordServiceRef = useRef<WakeWordService | null>(null);
  /**
   * Synchronous arming lock: set BEFORE any async work in armWakeWord() and
   * cleared only in stopWakeWord(). Because ref writes are synchronous, this
   * closes the gap where two armWakeWord() calls race across await boundaries
   * (e.g. a VAD state tick re-firing while engine.initialize() is in flight).
   */
  const wakeWordArmingRef = useRef(false);
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
  /**
   * True while TTS audio is being synthesized or played back. While set,
   * MicVAD speech-start events are IGNORED — the assistant's own voice
   * through the speaker triggers VAD otherwise (echo/self-triggering).
   * Users barge in via the explicit cancelPlayback() UI control instead.
   */
  const isTTSPlayingRef = useRef(false);
  onResultRef.current = onResult;
  
  const updateState = useCallback((nextState: VoiceState) => {
    if (isUnmountedRef.current) return;
    stateRef.current = nextState;
    setState(nextState);
  }, []);

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
    const listener = wakeWordRef.current;
    if (!listener) {
      // Nothing armed (or teardown already in progress) — do NOT call
      // listener.stop() on a service that another flow is still initializing;
      // that was causing WakeWordEngine.initialize() to be cancelled midway.
      wakeWordServiceRef.current = null;
      wakeWordArmingRef.current = false;
      setWakeWordEnabled(false);
      return;
    }
    wakeWordRef.current = null;
    wakeWordServiceRef.current = null;
    // Release the synchronous arming lock so a future armWakeWord() can run.
    wakeWordArmingRef.current = false;
    setWakeWordEnabled(false);
    await listener.stop();
  }, []);

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

    const url = process.env.REACT_APP_STT_SOCKET_URL || DEFAULT_STT_URL;

    console.log('🔵 [VoiceAssistant] Creating NEW VoiceSocket', {
      url,
      userId: authRef.current.userId,
      companyId: authRef.current.companyId,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const safeResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const safeReject = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const socket = new VoiceSocket({
        url,
        sampleRate: SAMPLE_RATE,
        auth: {
          userId: authRef.current.userId,
          companyId: authRef.current.companyId,
        },
        onTranscript: (event) => {
          if (isUnmountedRef.current) return;

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

            void (async () => {
              try {
                console.log('📤 [STT] Sending final transcript to n8n:', finalText);
                const result = await onResultRef.current(finalText);

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
                      () => updateState('SPEAKING'),
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

                updateState('IDLE');

                if (optionsRef.current.isSessionActive?.()) {
                  void resumeListeningRef.current();
                } else {
                  void armWakeWord();
                }
              } catch (error) {
                console.error('❌ [STT] Error processing final transcript:', error);
                updateState('ERROR');
                setErrorMessage(
                  error instanceof Error ? error.message : 'Error processing transcript',
                );
              }
            })();
          }
        },
        onError: (message) => {
          if (isUnmountedRef.current) return;
          console.error('🔴 [VoiceAssistant] VoiceSocket error:', message);
          if (shouldListenRef.current) {
            setErrorMessage(message);
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
          } else if (socketState === 'ERROR') {
            safeReject(new Error('Speech WebSocket entered ERROR state'));
          }
        },
      });

      socketRef.current = socket;
      socket.connect();
    });
  }, [playChime, updateState, updateTranscript]);

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
    console.log('🎤 [VAD:MIC] Requesting microphone stream');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    console.log('🎤 [VAD:MIC] Got microphone stream', {
      id: stream.id,
      active: stream.active,
      tracks: stream.getAudioTracks().map(track => ({
        label: track.label,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted,
      })),
    });

    return stream;
  }, []);
  
  //persistent refs for VAD callbacks to keep identity stable
  const onSpeechStartRef = useRef(() => {});
  const onFrameProcessedRef = useRef((_probabilities: any, _frame: Float32Array) => {});
  const onSpeechEndRef = useRef(() => {});

  /**
   * Drains the pre-roll ring buffer to the socket in capture order. Only
   * called once the socket is strictly OPEN — frames sent here are either
   * delivered immediately or queued inside VoiceSocket for the OPEN flush.
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

    // Stop any currently playing TTS when user starts speaking
    ttsService.stopCurrentAudio();

    bargeIn();

    // SOCKET GATE: the server may have closed the socket (code 1000) between
    // turns. If it's missing or not OPEN when speech begins, re-open it and
    // wait for a strictly OPEN readyState BEFORE flushing pre-roll, so the
    // opening words are buffered/queued rather than dropped.
    if (!socketRef.current || !socketRef.current.isConnected()) {
      console.log('🔄 [VAD] Socket closed before speech start — re-opening socket...');
      void (async () => {
        try {
          await createSocket();
          const open = await ensureSocketOpen();
          if (!open || isUnmountedRef.current) {
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
        // Actively streaming: send live frames to the STT socket.
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
      vadRef.current?.pause();
    } catch (err) {
      console.warn('⚠️ Could not pause VAD:', err);
    }
    updateState('PROCESSING');
  };
  //Pass stable useCallback wrappers into useMicVAD
  console.log('🧠 [VAD:LIFECYCLE] Creating useMicVAD instance');
  const vad = useMicVAD({
    startOnLoad: false,
    model: 'v5',
    getStream: getMicStream,
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: ONNX_WASM_PATH,
    onSpeechStart: useCallback(() => onSpeechStartRef.current(), []),
    onFrameProcessed: useCallback((p: any, f: Float32Array) => onFrameProcessedRef.current(p, f), []),
    onSpeechEnd: useCallback(() => onSpeechEndRef.current(), []),
    onVADMisfire: useCallback(() => { streamingRef.current = false; }, []),
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
    if (isUnmountedRef.current) return;
    // Synchronous lock check — runs before ANY async setup. Prevents VAD
    // lifecycle ticks from re-entering while WakeWordEngine.initialize()
    // is still in flight (initializing: true).
    if (wakeWordArmingRef.current || wakeWordRef.current) {
      console.log('🟣 [WakeWord] armWakeWord skipped — initialization already in progress or armed');
      return;
    }
    if (!supported || shouldListenRef.current) return;
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
    console.log('🔍 [Debug] armWakeWord() function entered', {
      isUnmounted: isUnmountedRef.current,
      supported,
      alreadyArmed: Boolean(wakeWordRef.current),
      shouldListen: shouldListenRef.current,
    });
    const listener = new WakeWordService({
      keywordPath: WAKE_WORD_KEYWORD_PATH,
      modelPath: WAKE_WORD_MODEL_PATH,
      onWakeWord: () => {
        if (isUnmountedRef.current) return;
        if (shouldListenRef.current) return;
        void (async () => {
          // Stop wake-word detection first so the mic track is released cleanly
          await stopWakeWord();
          playChime();

          // External owner (global VoiceAssistantContext) takes over from here:
          // it navigates to the chat surface and starts MicVAD itself.
          const externalHandler = optionsRef.current.onWakeWordDetected;
          if (externalHandler) {
            externalHandler();
            return;
          }

          shouldListenRef.current = true;
          streamingRef.current = false;
          setDone(false);
          setErrorMessage(null);
          updateTranscript('');
          updateState('LISTENING');
          // faster-whisper-server closes the WebSocket (code 1000) after the
          // previous turn's final transcript. Re-create the socket if the
          // existing one is no longer OPEN before VAD starts streaming.
          if (!socketRef.current || !socketRef.current.isConnected()) {
            console.log('🔄 [VoiceAssistant] Socket closed/missing — re-creating VoiceSocket');
            await createSocket();
          } else {
            console.log('♻️ [VoiceAssistant] Reusing existing OPEN socket');
          }
          if (isUnmountedRef.current) return;
          // Strict handshake: wait for the STT WebSocket to be fully OPEN
          // (with a small grace period for the browser to release the
          // wake-word mic track) before MicVAD opens its own stream.
          setTimeout(() => {
            if (isUnmountedRef.current) return;
            console.log('🟡 [VAD:START] Waiting for socket OPEN before starting MicVAD...');
            void (async () => {
              const socketOpen = await ensureSocketOpen();
              if (!socketOpen || isUnmountedRef.current) {
                console.error('🔴 [VAD:START] Aborting wake-word start — no OPEN socket');
                return;
              }
              console.log('🟢 [VAD:START] Socket OPEN — starting MicVAD pipeline');
              void vadRef.current?.start();
            })();
          }, 50);
        })();
      },
      onLevel: setAudioLevel,
      onError: (message) => {
        if (isUnmountedRef.current) return;
        setErrorMessage(message);
      },
    });
    wakeWordRef.current = listener;
    wakeWordServiceRef.current = listener;
    try {
      await listener.start();
      // start() can return cleanly even when it was aborted mid-flight by a
      // stop() request (the abort path returns instead of throwing). Verify
      // the engine actually reached the active/listening state; if not, treat
      // as failure and retry via the gesture gate.
      if (!listener.isActive) {
        console.warn('🟣 [WakeWord] start() returned but engine is NOT active — treating as aborted');
        if (wakeWordRef.current === listener) wakeWordRef.current = null;
        wakeWordServiceRef.current = null;
        wakeWordArmingRef.current = false;
        setWakeWordEnabled(false);
        armOnFirstGesture('start aborted during initialization');
        return;
      }
      setWakeWordEnabled(true);
      console.log('🟢 [WakeWord] Wake word armed and listening for "Hey Aira"');
    } catch (error: unknown) {
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
        setErrorMessage(error.message);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armOnFirstGesture, createSocket, playChime, stopWakeWord, supported, updateState, updateTranscript]);

  // Keep the late-bound reference in sync after armWakeWord is defined.
  armWakeWordRef.current = armWakeWord;

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
   * effect raced ahead and started the mic with streaming disabled — the
   * server then received no audio and closed the socket (code 1000),
   * killing every subsequent turn.
   */
  const resumeListeningAfterTurn = useCallback(async () => {
    if (isUnmountedRef.current) return;
    console.log('🔁 [VoiceAssistant] Multi-turn: resuming listening for next utterance');
    shouldListenRef.current = true;
    streamingRef.current = false;
    setDone(false);
    setErrorMessage(null);
    updateTranscript('');
    updateState('LISTENING');
    try {
      // faster-whisper-server closes the WebSocket after every final
      // transcript — always verify/re-open before VAD streams again.
      if (!socketRef.current || !socketRef.current.isConnected()) {
        console.log('🔄 [MultiTurn] Socket closed — re-creating VoiceSocket');
        await createSocket();
      }
      const socketOpen = await ensureSocketOpen();
      if (!socketOpen || isUnmountedRef.current || !optionsRef.current.isSessionActive?.()) {
        console.error('🔴 [MultiTurn] Aborting resume — no OPEN socket or session ended');
        shouldListenRef.current = false;
        updateState('IDLE');
        void armWakeWord();
        return;
      }

      // MicVAD tears down / re-creates its internal instance after each
      // turn's pause(), so vad.loading is frequently TRUE right here.
      // Poll until the fresh instance is ready (max 5s) rather than bailing.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (isUnmountedRef.current) return;
        const currentVad = vadRef.current;
        if (currentVad && !currentVad.loading && !currentVad.errored) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }

      // Re-check the session gate — the user may have exited while polling.
      if (!optionsRef.current.isSessionActive?.()) {
        console.log('🛑 [MultiTurn] Session ended while waiting for VAD — falling back to wake word');
        shouldListenRef.current = false;
        updateState('IDLE');
        void armWakeWord();
        return;
      }

      const currentVad = vadRef.current;
      if (currentVad && !currentVad.loading && !currentVad.errored) {
        if (!currentVad.listening) {
          console.log('🟢 [MultiTurn] Restarting MicVAD for next turn');
          await currentVad.start();
        } else {
          console.log('🟢 [MultiTurn] MicVAD already listening — continuing session');
        }
        console.log('🟢 [MultiTurn] Session continues — listening for next utterance');
      } else {
        console.log('⏳ [MultiTurn] VAD failed to become ready — deferring to wake word');
        shouldListenRef.current = false;
        updateState('IDLE');
        void armWakeWord();
      }
    } catch (error) {
      console.error('🔴 [MultiTurn] Failed to resume listening:', error);
      shouldListenRef.current = false;
      updateState('IDLE');
      void armWakeWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armWakeWord, createSocket, ensureSocketOpen, updateState, updateTranscript]);

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
    console.log('🎙️ [VoiceAssistant] START called');

    if (!supported) {
      console.error('❌ [VoiceAssistant] Voice is not supported');
      return;
    }

    console.log('🎙️ [VoiceAssistant] Before stopping wake word');

    console.log('🟣 [WakeWord] NOT involved in manual voice test');

    console.log('🎙️ [VoiceAssistant] Starting voice session');

    // NOTE: shouldListenRef/streamingRef are intentionally NOT armed yet.
    // They flip to true only AFTER the socket has been verified OPEN and
    // held stable (see the stability hold below), so no frames stream
    // during the handshake/stabilization window.

    setDone(false);
    setErrorMessage(null);
    updateTranscript('');
    updateState('LISTENING');

    console.log('🎙️ [VoiceAssistant] Creating STT socket');
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      console.log('🎤 [MIC] Available devices:', devices.map(device => ({
        kind: device.kind,
        label: device.label,
        deviceId: device.deviceId ? 'present' : 'missing',
      })));
    } catch (error) {
      console.error('🔴 [MIC] Could not enumerate devices:', error);
    }

    // STRICT HANDSHAKE SEQUENCING — manual voice mode:
    //   1. Create/verify the STT socket.
    //   2. Await WebSocket OPEN (readyState === 1) — no exceptions.
    //   3. ONLY THEN call vad.start() so captured frames stream immediately
    //      instead of being clipped while the handshake is in flight.
    // Open a fresh STT session and verify it. VoiceSocket intentionally does
    // not perform hidden background reconnects because that can race this
    // start() call and swap the underlying WebSocket while we are stabilizing.
    let socketOpen = false;
    let lastSocketError: unknown = null;

    for (let attempt = 1; attempt <= 2 && !socketOpen; attempt += 1) {
      try {
        if (!socketRef.current || !socketRef.current.isConnected()) {
          console.log(`🔄 [VoiceAssistant] Opening STT socket (attempt ${attempt}/2)`);
          await createSocket();
        }

        socketOpen = await ensureSocketOpen();

        if (!socketOpen) {
          lastSocketError = new Error('WebSocket did not reach OPEN');
        }
      } catch (error) {
        lastSocketError = error;
        console.error(`🔴 [VoiceAssistant] STT socket attempt ${attempt} failed:`, error);
      }

      if (!socketOpen && attempt < 2) {
        console.warn('⚠️ [VoiceAssistant] Retrying STT WebSocket with a fresh instance');
        try {
          socketRef.current?.disconnect();
        } catch {
          // ignore
        }
        socketRef.current = null;
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      }
    }

    if (!socketOpen || isUnmountedRef.current) {
      console.error('🔴 [VoiceAssistant] Aborting start — STT WebSocket is not OPEN', lastSocketError);
      setErrorMessage('Could not connect to the speech service. Please try again.');
      updateState('ERROR');
      shouldListenRef.current = false;
      return;
    }

    // Short stability check. This now detects a real server/proxy drop; it
    // no longer competes with VoiceSocket's automatic reconnect mechanism.
    console.log('⏱️ [VoiceAssistant] Holding for socket stabilization (250ms)...');
    const stabilizeStart = Date.now();

    while (Date.now() - stabilizeStart < 250) {
      if (isUnmountedRef.current || !socketRef.current?.isConnected()) {
        console.error('🔴 [VoiceAssistant] STT server/proxy closed the socket during stabilization');
        setErrorMessage('Speech service connection was interrupted. Please try again.');
        updateState('ERROR');
        shouldListenRef.current = false;
        return;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

    // Pre-roll: brief pause after VAD's mic stream opens so its audio worklet
    // and resampler are warmed up before frames are allowed to stream.
    shouldListenRef.current = true;
    streamingRef.current = false;

    console.log('🎙️ [VoiceAssistant] Socket stable — starting VAD');
    if (vad.loading) {
      console.log('⏳ [VAD:START] VAD is still loading — start will be deferred');
      return;
    }
    try {
      console.log('🟡 [VAD:START] Calling vad.start()');
      await vad.start();
      // Give the audio pipeline a moment to produce its first clean frames
      // before enabling streaming to Whisper.
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      console.log('🟢 [VoiceAssistant] Session armed — streaming enabled', {
        listening: vad.listening,
        errored: vad.errored,
      });
    } catch (error) {
      console.error('🔴 [VAD:START] vad.start() threw an error:', error);
    }
  }, [
    createSocket,
    ensureSocketOpen,
    stopWakeWord,
    supported,
    updateState,
    updateTranscript,
    vad,
  ]);

  const stop = useCallback(() => {
    if (isUnmountedRef.current) return;
    shouldListenRef.current = false;
    streamingRef.current = false;
    preRollBufferRef.current = [];
    // Only pause if VAD is loaded and listening
    if (!vad.loading && !vad.errored) {
      try {
        vad.pause();
      } catch (err) {
        console.warn('VAD pause ignored:', err);
      }
    }
    socketRef.current?.endUtterance();
    socketRef.current?.disconnect();
    if (transcriptRef.current.trim()) setDone(true);
    updateState('IDLE');
    void armWakeWord();
  }, [armWakeWord, updateState, vad]);

  const cancel = useCallback(() => {
    if (isUnmountedRef.current) return;
    shouldListenRef.current = false;
    streamingRef.current = false;
    preRollBufferRef.current = [];
    // Only pause if VAD is loaded and listening
    if (!vad.loading && !vad.errored) {
      try {
        vad.pause();
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
    void armWakeWord();
  }, [armWakeWord, updateState, updateTranscript, vad]);

  const accept = useCallback(async (textOverride?: string) => {
    if (isUnmountedRef.current) return;
    const text = (textOverride ?? transcriptRef.current).trim();
    if (!text || stateRef.current === 'PROCESSING') return;
    shouldListenRef.current = false;
    streamingRef.current = false;
    // Only pause if VAD is loaded and listening
    if (!vad.loading && !vad.errored) {
      try {
        vad.pause();
      } catch (err) {
        console.warn('VAD pause ignored:', err);
      }
    }
    socketRef.current?.disconnect();
    updateState('PROCESSING');
    setDone(false);
    try {
      await onResultRef.current(text);
      updateTranscript('');
      updateState('IDLE');
      void armWakeWord();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send voice message.');
      updateState('ERROR');
    }
  }, [armWakeWord, updateState, updateTranscript, vad]);

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
    if (currentPath === undefined) return;
    if (isPublicRoute(currentPath)) {
      console.log('🚫 [WakeWord] Route changed to public — tearing down listener:', currentPath);
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
    console.log('🧠 [VAD] Loading state changed:', vad.loading);
    if (
      !vad.loading &&
      !vad.errored &&
      shouldListenRef.current &&
      !vad.listening
    ) {
      console.log('🟢 [VAD:READY] VAD finished loading — starting microphone');
      // Same strict handshake as start(): never begin capture until the STT
      // WebSocket is fully OPEN, otherwise early frames are dropped.
      void (async () => {
        const socketOpen = await ensureSocketOpen();
        if (!socketOpen || isUnmountedRef.current) {
          console.error('🔴 [VAD:READY] Aborting deferred start — no OPEN socket');
          return;
        }
        void vad.start()
          .then(() => {
            console.log('🟢 [VAD:READY] VAD microphone started', {
              listening: vad.listening,
              errored: vad.errored,
            });
          })
          .catch((error) => {
            console.error('🔴 [VAD:READY] Failed to start VAD:', error);
          });
      })();
    }
  }, [ensureSocketOpen, updateState, vad.loading, vad.errored, vad.listening, vad]);

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
      shouldListenRef.current = false;
      streamingRef.current = false;
      // Prevent MicVAD null stream crash on rapid unmount: only pause when
      // the instance finished initializing; never destroy mid-setup, since
      // the library's internal cleanup throws
      // "MicVAD has null stream, audio context, or processor adapter"
      // when teardown races an in-flight async init.
      try {
        if (vadRef.current && !vadRef.current.loading && !vadRef.current.errored) {
          void vadRef.current.pause();
        }
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
  }, []); 

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