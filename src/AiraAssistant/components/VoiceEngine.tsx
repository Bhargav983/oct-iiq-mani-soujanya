import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import type { Language, VoiceState } from '../types';
import {
  useVoiceAssistant,
} from '../hooks/useVoiceAssistant';
import type { AuthParams } from '../utils/useAuth';

export interface VoiceSnapshot {
  supported: boolean;
  wakeWordEnabled: boolean;
  state: VoiceState;
  listening: boolean;
  processing: boolean;
  transcript: string;
  done: boolean;
  errorMessage: string | null;
  audioLevel: number;
}

export interface VoiceEngineHandle {
  start: () => void | Promise<void>;
  stop: () => void;
  cancel: () => void;
  accept: (textOverride?: string) => Promise<void>;

  /** Manual barge-in: stops TTS playback so the user can speak. */
  cancelPlayback: () => void;
}

interface VoiceEngineProps {
  lang: Language;

  onResult: (
    text: string
  ) => Promise<string | void> | string | void;

  onSnapshot: (snapshot: VoiceSnapshot) => void;

  /**
   * When set, wake-word detection hands control to this callback instead of
   * starting MicVAD in-place (used by the global VoiceAssistantContext).
   */
  onWakeWordDetected?: () => void;

  /**
   * Continuous-session gate — polled at the end of each voice turn.
   * While it returns true, the pipeline auto-resumes listening
   * (multi-turn loop); when false, it falls back to arming the wake word.
   */
  isSessionActive?: () => boolean;

  /**
   * Current React Router pathname.
   * Forwarded to the hook so the wake-word listener can be gated against
   * the public-route allowlist.
   */
  currentPathname?: string;

  /**
   * Authenticated identity for the current session.
   *
   * AuthParams requires both userId and companyId.
   */
  auth?: AuthParams;
}

/**
 * IMPORTANT:
 * This component must only be rendered once the user has actually
 * requested voice input (e.g. tapped the mic button) — not unconditionally
 * alongside the rest of the chat page.
 *
 * useVoiceAssistant -> useMicVAD creates a MicVAD instance whose setup
 * (fetching WASM/ONNX assets, opening the mic stream, wiring the audio
 * worklet) is asynchronous.
 *
 * If the host page mounts and unmounts quickly, the async setup can still
 * be in flight when the component unmounts. The library's own cleanup can
 * then try to tear down an instance that never finished initializing.
 *
 * By only mounting this component on first real voice use, that race is
 * avoided for the common case where the user never touches voice.
 *
 * Once mounted, keep it mounted for the rest of the page's life rather than
 * mounting/unmounting it repeatedly.
 */
export const VoiceEngine = forwardRef<
  VoiceEngineHandle,
  VoiceEngineProps
>(function VoiceEngine(
  {
    lang,
    onResult,
    onSnapshot,
    onWakeWordDetected,
    isSessionActive,
    currentPathname,
    auth,
  },
  ref
) {
  const voice = useVoiceAssistant(onResult, lang, {
    onWakeWordDetected,
    isSessionActive,
    currentPathname,
    auth,
  });

  useImperativeHandle(
    ref,
    () => ({
      start: voice.start,
      stop: voice.stop,
      cancel: voice.cancel,
      accept: voice.accept,
      cancelPlayback: voice.cancelPlayback,
    }),
    [
      voice.start,
      voice.stop,
      voice.cancel,
      voice.accept,
      voice.cancelPlayback,
    ]
  );

  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    onSnapshotRef.current({
      supported: voice.supported,
      wakeWordEnabled: voice.wakeWordEnabled,
      state: voice.state,
      listening: voice.listening,
      processing: voice.processing,
      transcript: voice.transcript,
      done: voice.done,
      errorMessage: voice.errorMessage,
      audioLevel: voice.audioLevel,
    });
  }, [
    voice.supported,
    voice.wakeWordEnabled,
    voice.state,
    voice.listening,
    voice.processing,
    voice.transcript,
    voice.done,
    voice.errorMessage,
    voice.audioLevel,
  ]);

  return null;
});
