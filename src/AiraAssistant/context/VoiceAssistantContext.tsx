import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VoiceEngine, type VoiceEngineHandle, type VoiceSnapshot } from '../components/VoiceEngine';
import { callAssistant, mapResponse } from '../services/api';
import type { Language } from '../types';
import { getAuthContext, useAuth, type AuthParams } from '../utils/useAuth';

type NavigateFn = (path: string) => void;
type VoiceResultHandler = (text: string) => Promise<string | void> | string | void;
type SnapshotHandler = (snapshot: VoiceSnapshot) => void;

/** How the current voice session was started — drives which UI surface renders. */
export type VoiceActivationSource = 'wake_word' | 'manual';

export interface VoiceAssistantContextValue {
  /** True while MicVAD + STT socket session is running (user spoke "Hey Aira" or tapped mic). */
  isVoiceActive: boolean;
  /**
   * How the active session started:
   * - 'wake_word': "Hey Aira" from the dashboard -> full-screen AIR₂O orb overlay.
   * - 'manual': mic button tapped inside chat -> inline morphing voice dock.
   */
  voiceActivationSource: VoiceActivationSource;
  /** True while the background OpenWakeWord listener is armed and listening for "Hey Aira". */
  wakeWordArmed: boolean;
  /** True once the wake word (or user) has opened the chat surface. */
  isChatOpen: boolean;
  /** Called by the wake-word pipeline: disarm -> chime -> navigate -> (50ms) start MicVAD. */
  openChatFromWakeWord: () => void;
  /** Closes the chat surface, deactivates voice and re-arms the wake word. */
  closeChat: () => void;
  /** Manual activation (mic button). Starts MicVAD + STT without navigation. */
  activateVoice: () => void;
  /** Stops MicVAD + STT and re-arms the wake word in the background. */
  deactivateVoice: () => void;
  /** Finalizes the current transcript and sends it through the pipeline. */
  acceptTranscript: () => void;
  /**
   * Manual barge-in: stops TTS playback immediately (✕ / tap-the-orb) and
   * re-enables the mic, which is suppressed while AIRA is speaking.
   */
  cancelPlayback: () => void;
  /** Registered by <VoiceNavigationBridge /> so the provider can navigate without owning Router. */
  registerNavigator: (navigate: NavigateFn | null) => void;
  /** Registered by <LocationBridge /> so the provider can read the current pathname without owning Router. */
  registerLocation: (pathname: string | null) => void;
  /** Registered by AssistantPage so voice transcripts route into the chat message flow. */
  registerResultHandler: (handler: VoiceResultHandler | null) => void;
  /** Registered by AssistantPage to mirror voice UI state (transcript, audio level, ...). */
  registerSnapshotHandler: (handler: SnapshotHandler | null) => void;
  /**
   * Authenticated identity for the current session. Sourced from the
   * application's primary <AuthContext /> (via `useAuth()`) and re-read
   * on every render so login/logout/refresh is reflected immediately.
   *
   * `userId`     — the customer's ID (AuthContext.user.customer_id /
   *                AuthContext.user.delegate_id, falling back to the
   *                `userId` localStorage key only as a cold-start helper).
   * `companyId`  — the company this customer/delegate belongs to
   *                (AuthContext.user.company_id, falling back to
   *                `selectedService.company` for cold start).
   *
   * Empty strings are possible during the very first render after a
   * hard reload — call sites that strictly require an identity should
   * gate on `userId && companyId` before sending the request.
   */
  userId: string;
  companyId: string;
}

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | null>(null);

export function useVoiceAssistantContext(): VoiceAssistantContextValue {
  const value = useContext(VoiceAssistantContext);
  if (!value) {
    throw new Error('useVoiceAssistantContext must be used within <VoiceAssistantProvider>');
  }
  return value;
}

/**
 * Registers the Router's navigate() with the VoiceAssistantProvider.
 * Must be rendered INSIDE <Router> (the provider itself sits outside of it).
 */
export function VoiceNavigationBridge() {
  const navigate = useNavigate();
  const { registerNavigator } = useVoiceAssistantContext();

  useEffect(() => {
    registerNavigator(navigate);
    return () => registerNavigator(null);
  }, [navigate, registerNavigator]);

  return null;
}

/**
 * Streams the current React Router pathname into the VoiceAssistantProvider.
 * Must be rendered INSIDE <Router> (the provider itself sits outside of it).
 * The provider uses the latest pathname to gate the wake-word listener
 * against the public-route allowlist (see utils/publicRoutes.ts).
 */
export function LocationBridge() {
  const location = useLocation();
  const { registerLocation } = useVoiceAssistantContext();

  useEffect(() => {
    registerLocation(location.pathname);
    return () => registerLocation(null);
  }, [location.pathname, registerLocation]);

  return null;
}

interface VoiceAssistantProviderProps {
  children: ReactNode;
  lang?: Language;
}

/**
 * Owns the single persistent voice pipeline for the entire app:
 *
 *   WakeWordService (background, always re-armed between sessions)
 *        │ "Hey Aira"
 *        ▼
 *   disarm -> chime -> navigate('/chat-bot') -> 50ms -> MicVAD + STT socket
 *        │ turn complete (TTS played)
 *        ▼
 *   re-arm WakeWordService in the background
 *
 * The <VoiceEngine /> mounted here NEVER unmounts across route changes, which
 * is what makes the MicVAD create/destroy race impossible (see VoiceEngine.tsx).
 */
export function VoiceAssistantProvider({ children, lang = 'en' }: VoiceAssistantProviderProps) {
  console.log('🔍 [Debug] VoiceAssistantProvider mounted');
  // PRIMARY source of truth: the application's React <AuthContext />. The
  // AiraAssistant pipeline no longer relies on static constants or
  // module-level localStorage reads — every n8n call and WebSocket
  // handshake is now driven by the live authenticated session.
  const { user } = useAuth();
  const { userId, companyId } = getAuthContext(user);
  console.log('🔐 [VoiceAssistantContext] Auth resolved', { userId, companyId });

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceActivationSource, setVoiceActivationSource] = useState<VoiceActivationSource>('manual');
  const [wakeWordArmed, setWakeWordArmed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const navigateRef = useRef<NavigateFn | null>(null);
  const resultHandlerRef = useRef<VoiceResultHandler | null>(null);
  const snapshotHandlerRef = useRef<SnapshotHandler | null>(null);
  const voiceRef = useRef<VoiceEngineHandle>(null);
  /**
   * Live React Router pathname. Updated by <LocationBridge /> (rendered
   * inside <Router>); read by <VoiceEngine /> so the wake-word listener
   * can be gated against the public-route allowlist. Stored in a ref
   * AND in state — the ref is passed straight to the engine (no render
   * churn), the state re-renders the engine when the path actually
   * changes so the hook's route-watcher effect re-fires.
   */
  const [currentPathname, setCurrentPathname] = useState<string | null>(null);
  /** Late-bound mirror of isVoiceActive so the voice hook can poll session
   * state without stale-closure issues inside its async turn loop. */
  const isVoiceActiveRef = useRef(false);

  /**
   * Routes transcripts into the chat flow. While AssistantPage is mounted it
   * registers a handler; otherwise (e.g. wake word fired on a non-chat route
   * before navigation commits) we fall back to querying n8n directly so the
   * spoken reply still plays via TTS.
   *
   * The n8n fallback path now reads `userId` / `companyId` from the
   * current closure (driven by `useAuth()` in the provider) and threads
   * them through `callAssistant`'s `authParams` argument, so the webhook
   * payload is always tagged with the LIVE authenticated identity rather
   * than whatever was in localStorage when the module was first loaded.
   */
  const handleVoiceResult = useCallback(async (text: string): Promise<string> => {
    const handler = resultHandlerRef.current;
    if (handler) {
      const result = await handler(text);
      return typeof result === 'string' ? result : '';
    }
    try {
      const response = await callAssistant(text, { userId, companyId });
      const { messages } = mapResponse(response, text);
      const reply = messages.find(
        (message) => message.role === 'assistant' && message.kind === 'text' && message.text,
      )?.text;
      return reply ?? '';
    } catch (error) {
      console.error('🔴 [VoiceAssistantContext] Fallback n8n call failed:', error);
      return '';
    }
  }, [userId, companyId]);

  const handleSnapshot = useCallback((snapshot: VoiceSnapshot) => {
    setWakeWordArmed(snapshot.wakeWordEnabled);
    snapshotHandlerRef.current?.(snapshot);
  }, []);

  /**
   * Wake-word entry point. By the time this runs, useVoiceAssistant has already
   * stopped WakeWordService (freeing the mic) and played the activation chime.
   * We navigate to the chat surface, flip the UI flags, then give the browser
   * ~50ms to release the wake-word audio track before MicVAD opens its own
   * stream (same sequencing the in-page flow used successfully).
   */
  const openChatFromWakeWord = useCallback(() => {
    console.log('🟣 [VoiceAssistantContext] Wake word detected — opening full-screen orb overlay');
    isVoiceActiveRef.current = true;
    setVoiceActivationSource('wake_word');
    setIsChatOpen(true);
    setIsVoiceActive(true);
    navigateRef.current?.('/chat-bot');
    window.setTimeout(() => {
      void voiceRef.current?.start();
    }, 50);
  }, []);

  const activateVoice = useCallback(() => {
    console.log('🎙️ [VoiceAssistantContext] Manual voice activation — inline morphing dock');
    isVoiceActiveRef.current = true;
    setVoiceActivationSource('manual');
    setIsChatOpen(true);
    setIsVoiceActive(true);
    void voiceRef.current?.start();
  }, []);

  const deactivateVoice = useCallback(() => {
    console.log('🛑 [VoiceAssistantContext] Deactivating voice — re-arming wake word');
    // Flip the multi-turn gate FIRST so any turn completing concurrently
    // sees the session as ended and falls back to wake-word arming.
    isVoiceActiveRef.current = false;
    setIsVoiceActive(false);
    // stop() pauses VAD, ends/disconnects the STT socket and re-arms the
    // wake word listener inside useVoiceAssistant.
    voiceRef.current?.stop();
  }, []);

  const acceptTranscript = useCallback(() => {
    void voiceRef.current?.accept();
  }, []);

  const cancelPlayback = useCallback(() => {
    console.log('🎛️ [VoiceAssistantContext] Manual barge-in via UI');
    voiceRef.current?.cancelPlayback();
  }, []);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    deactivateVoice();
  }, [deactivateVoice]);

  const registerNavigator = useCallback((navigate: NavigateFn | null) => {
    navigateRef.current = navigate;
  }, []);

  const registerLocation = useCallback((pathname: string | null) => {
    setCurrentPathname(pathname);
  }, []);

  const registerResultHandler = useCallback((handler: VoiceResultHandler | null) => {
    resultHandlerRef.current = handler;
  }, []);

  const registerSnapshotHandler = useCallback((handler: SnapshotHandler | null) => {
    snapshotHandlerRef.current = handler;
  }, []);

  const value = useMemo<VoiceAssistantContextValue>(
    () => ({
      isVoiceActive,
      voiceActivationSource,
      wakeWordArmed,
      isChatOpen,
      openChatFromWakeWord,
      closeChat,
      activateVoice,
      deactivateVoice,
      acceptTranscript,
      cancelPlayback,
      registerNavigator,
      registerLocation,
      registerResultHandler,
      registerSnapshotHandler,
      userId,
      companyId,
    }),
    [
      isVoiceActive,
      voiceActivationSource,
      wakeWordArmed,
      isChatOpen,
      openChatFromWakeWord,
      closeChat,
      activateVoice,
      deactivateVoice,
      acceptTranscript,
      cancelPlayback,
      registerNavigator,
      registerLocation,
      registerResultHandler,
      registerSnapshotHandler,
      userId,
      companyId,
    ],
  );

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
      {/* Single persistent voice pipeline — never unmounts across routes.
          isSessionActive gates the multi-turn loop: while a voice session
          (inline dock or orb overlay) is up, each turn auto-resumes
          listening; once deactivated, the wake word re-arms instead. */}
      <VoiceEngine
        ref={voiceRef}
        lang={lang}
        onResult={handleVoiceResult}
        onSnapshot={handleSnapshot}
        onWakeWordDetected={openChatFromWakeWord}
        isSessionActive={() => isVoiceActiveRef.current}
        currentPathname={currentPathname ?? undefined}
        // Authenticated identity threaded from <AuthContext /> -> the
        // VoiceEngine -> useVoiceAssistant -> VoiceSocket so the STT
        // WebSocket handshake is tagged with the current customer /
        // company (see voiceSocket.ts -> openSocket).
        auth={{ userId, companyId }}
      />
    </VoiceAssistantContext.Provider>
  );
}
