import { requestedLanguage } from '../services/voiceLanguage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import type { Action, ChatMessage, Language, QuickActionKey, SuggestedAction } from '../types';
import { t } from '../i18n/strings';
import './AssistantPage.css';
import { AssistantHeader } from './AssistantHeader';
import { ChatInput } from './ChatInput';
import { ChatMessageView } from './ChatMessage';
import { InlineVoiceDock } from './InlineVoiceDock';
import { VoiceModeOverlay } from './VoiceModeOverlay';
import type { VoiceSnapshot } from './VoiceEngine';
import { useVoiceAssistantContext } from '../context/VoiceAssistantContext';
import { defaultSuggestedActions, dispatch, makeInitialContext } from '../services/chatService';
import { callAssistant, mapResponse } from '../services/api';
import { getMachines } from '../services/machineService';
import type { ChatContext } from '../types';
import { createMessageId } from '../utils/messageId';
import { isVoiceSupported } from '../utils/voiceSupport';
import { PLAYBACK_INTERRUPTION_EVENT, ttsService } from '../services/ttsService';
import { stopMessagePlayback } from '../services/messagePlayback';
import { resetChatSessionId } from '../services/chatSession';

function welcomeMessage(lang: Language): ChatMessage {
  return { id: createMessageId('m'), role: 'assistant', kind: 'text', text: t(lang).welcome, timestamp: Date.now() };
}
function quickActionsMessage(lang: Language): ChatMessage {
  return {
    id: createMessageId('m'),
    role: 'assistant',
    kind: 'quickActions',
    suggestedActions: defaultSuggestedActions(lang),
    timestamp: Date.now(),
  };
}

const IDLE_VOICE_SNAPSHOT: VoiceSnapshot = {
  supported: isVoiceSupported(),
  wakeWordEnabled: false,
  state: 'IDLE',
  listening: false,
  processing: false,
  transcript: '',
  done: false,
  errorMessage: null,
  audioLevel: 0,
};

/**
 * Stops every in-flight TTS source registered on the window by the TTS
 * service / barge-in logic, so exiting voice mode never leaves audio
 * playing in the background.
 */
function stopAllVoiceAudio() {
  if (typeof window === 'undefined') return;
  const voiceWindow = window as Window & {
    __airaVoiceAudioSources__?: Set<AudioBufferSourceNode>;
    __airaVoiceAudioContexts__?: Set<AudioContext>;
  };
  voiceWindow.__airaVoiceAudioSources__?.forEach((source) => {
    try { source.stop(); } catch { /* already stopped */ }
  });
  voiceWindow.__airaVoiceAudioSources__?.clear();
  voiceWindow.__airaVoiceAudioContexts__?.forEach((context) => {
    try { void context.close(); } catch { /* already closed */ }
  });
  voiceWindow.__airaVoiceAudioContexts__?.clear();
  window.speechSynthesis?.cancel();
}

export function AssistantPage() {
  const [lang, setLang] = useState<Language>('en');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage('en'), quickActionsMessage('en')]);
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<ChatContext>(() => makeInitialContext());
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const [showVoiceUnsupported, setShowVoiceUnsupported] = useState(false);
  const [hiddenSuggestionsForMessageId, setHiddenSuggestionsForMessageId] = useState<string | null>(null);

  // Voice lifecycle is owned by the global VoiceAssistantProvider (mounted at
  // the app root). This page only registers handlers so transcripts route into
  // the chat message flow and the listening overlay mirrors the shared state.
  const {
    registerResultHandler,
    setVoiceLanguage,
    registerSnapshotHandler,
    activateVoice,
    deactivateVoice,
    acceptTranscript,
    cancelPlayback,
    isVoiceActive,
    voiceActivationSource,
    wakeWordArmed,
    // Authenticated identity, resolved by VoiceAssistantProvider from the
    // application's primary <AuthContext />. Threaded into every n8n
    // webhook call (initial machines fetch + every dispatch action) so
    // we never depend on module-level localStorage.
    userId,
    companyId,
  } = useVoiceAssistantContext();
  const auth = useMemo(() => ({ userId, companyId }), [userId, companyId]);
  const [voiceSnapshot, setVoiceSnapshot] = useState<VoiceSnapshot>(IDLE_VOICE_SNAPSHOT);
  const [interruption, setInterruption] = useState(ttsService.playbackInterruption);
  const [resumeError, setResumeError] = useState(false);
  useEffect(() => {
    const update = () => setInterruption(ttsService.playbackInterruption());
    window.addEventListener(PLAYBACK_INTERRUPTION_EVENT, update);
    update();
    return () => window.removeEventListener(PLAYBACK_INTERRUPTION_EVENT, update);
  }, []);
  useEffect(() => { setVoiceLanguage(lang); setCtx(previous => ({ ...previous, lang })); }, [lang, setVoiceLanguage]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const latestSuggestedActions = getLatestSuggestedActions(messages, hiddenSuggestionsForMessageId);

  // Initial machine fetch on app startup
  useEffect(() => {
    if (getMachines().length === 0) {
      // Silent background fetch from n8n. Identity flows from
      // VoiceAssistantContext (which read it from <AuthContext />) so
      // the webhook is tagged with the live customer/company.
      callAssistant("My Machines", auth)
        .then(res => mapResponse(res))
        .then(({ messages, contextPatch }) => {
          // mapResponse will automatically execute setCachedMachines() internally
          // Do NOT add the returned assistant messages into the chat UI state
          // Keep the chat UI completely silent while in-memory machineService populates
          if (contextPatch) setCtx((prev) => ({ ...prev, ...contextPatch, lang }));
        })
        .catch(err => {
          console.error('Failed to fetch machines:', err);
        });
    }
  }, [auth, lang]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Register this page's transcript handler and snapshot mirror with the
  // global voice pipeline while mounted. The provider falls back to calling
  // n8n directly if the wake word fires before navigation commits.
  useEffect(() => {
    registerResultHandler(handleVoiceResult);
    registerSnapshotHandler(setVoiceSnapshot);
    return () => {
      registerResultHandler(null);
      registerSnapshotHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerResultHandler, registerSnapshotHandler]);

  async function handleAction(action: Action) {
    // Intercept voice action and launch voice recognition instead of calling n8n
    if (action.type === 'quick' && action.key === 'voice') {
      openVoice();
      return;
    }

    if (busy) return;
    hideCurrentSuggestions();
    const currentLang = action.type === 'text' ? requestedLanguage(action.text, lang) : lang;
    if (currentLang !== lang) setLang(currentLang);
    const userText = userTextFor(action, currentLang);
    const userMsg = userText
      ? [{ id: createMessageId('m'), role: 'user' as const, kind: 'text' as const, text: userText, timestamp: Date.now() } satisfies ChatMessage]
      : [];
    setMessages((prev) => [...prev, ...userMsg]);
    setBusy(true);

    const result = dispatch(action, { ...ctx, lang: currentLang }, auth);

    const loadingId = result.loadingMessage?.id ?? null;
    if (result.loadingMessage) {
      setMessages((prev) => [...prev, result.loadingMessage!]);
    }

    try {
      const { messages, contextPatch } = await result.run();
      setMessages((prev) => {
        const safePrev = prev.filter((message): message is ChatMessage => Boolean(message));
        const withoutLoading = loadingId ? safePrev.filter((message) => message.id !== loadingId) : safePrev;
        return [...withoutLoading, ...messages];
      });
      if (contextPatch) setCtx((prev) => ({ ...prev, ...contextPatch, lang }));
    } catch {
      setMessages((prev) => {
        const safePrev = prev.filter((message): message is ChatMessage => Boolean(message));
        const withoutLoading = loadingId ? safePrev.filter((message) => message.id !== loadingId) : safePrev;
        return [...withoutLoading, { id: createMessageId('m'), role: 'assistant', kind: 'error', timestamp: Date.now() }];
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    hideCurrentSuggestions();
    await handleAction({ type: 'text', text: trimmed });
  }

  /**
   * Dedicated handler for voice results.
   * Unlike handleSendMessage, this MUST return the assistant's reply string
   * so useVoiceAssistant can pass it to the TTS service for playback.
   */
  async function handleVoiceResult(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return '';

    hideCurrentSuggestions();
    const currentLang = requestedLanguage(trimmed, lang);
    if (currentLang !== lang) setLang(currentLang);
    const userMsg: ChatMessage[] = [
      { id: createMessageId('m'), role: 'user', kind: 'text', text: trimmed, timestamp: Date.now() },
    ];
    setMessages((prev) => [...prev, ...userMsg]);
    setBusy(true);

    const result = dispatch({ type: 'text', text: trimmed }, { ...ctx, lang: currentLang }, auth);
    const loadingId = result.loadingMessage?.id ?? null;
    if (result.loadingMessage) {
      setMessages((prev) => [...prev, result.loadingMessage!]);
    }

    let replyText = '';
    try {
      const { messages: responseMessages, contextPatch } = await result.run();
      setMessages((prev) => {
        const safePrev = prev.filter((message): message is ChatMessage => Boolean(message));
        const withoutLoading = loadingId ? safePrev.filter((message) => message.id !== loadingId) : safePrev;
        return [...withoutLoading, ...responseMessages];
      });
      if (contextPatch) setCtx((prev) => ({ ...prev, ...contextPatch, lang: currentLang }));

      // Extract the assistant's reply text from the response messages for TTS
      for (const msg of responseMessages) {
        if (msg.role === 'assistant' && msg.kind === 'text' && msg.text) {
          replyText = msg.speechText ?? msg.text;
          break;
        }
      }
    } catch {
      setMessages((prev) => {
        const safePrev = prev.filter((message): message is ChatMessage => Boolean(message));
        const withoutLoading = loadingId ? safePrev.filter((message) => message.id !== loadingId) : safePrev;
        return [...withoutLoading, { id: createMessageId('m'), role: 'assistant', kind: 'error', timestamp: Date.now() }];
      });
    } finally {
      setBusy(false);
    }

    console.log('🔊 [VoiceResult] Returning reply text for TTS:', replyText?.substring(0, 80));
    return replyText;
  }

  function hideCurrentSuggestions() {
    const latestSuggestedMessage = findLatestSuggestedMessage(messages, hiddenSuggestionsForMessageId);
    if (latestSuggestedMessage) {
      setHiddenSuggestionsForMessageId(latestSuggestedMessage.id);
    }
  }

  function userTextFor(action: Action, l: Language): string | null {
    const s = t(l);
    switch (action.type) {
      case 'quick':
        if (action.key === 'myMachines') return s.qaMyMachines;
        if (action.key === 'status') return s.qaStatus;
        if (action.key === 'service') return s.qaService;
        if (action.key === 'controls') return s.qaControls;
        if (action.key === 'voice') return null;
        if (action.key === 'errorLogs') return s.qaViewErrorLogs || 'View Error Logs';
        return null;
      case 'viewDetails':
        return s.viewDetails;
      case 'checkStatus':
        return s.checkStatus;
      case 'controls':
        return s.controls;
      case 'raiseService':
        return s.raiseService;
      case 'checkMachineFirst':
        return s.checkMachineFirst;
      case 'setControl':
        return null;
      case 'confirmChange':
        return s.confirm;
      case 'cancelChange':
        return s.cancel;
      case 'text':
        return action.text;
      default:
        return null;
    }
  }

  function onQuick(key: QuickActionKey) {
    if (key === 'voice') {
      openVoice();
      return;
    }
    handleAction({ type: 'quick', key });
  }

  function openVoice() {
    if (!isVoiceSupported()) {
      setShowVoiceUnsupported(true);
      return;
    }
    // Delegates to the global provider: starts MicVAD + STT via the single
    // persistent VoiceEngine owned by VoiceAssistantProvider.
    activateVoice();
  }

  /**
   * Exits the voice overlay cleanly: halts any in-flight TTS playback
   * (window.__airaVoiceAudioSources__), stops MicVAD + closes the STT
   * WebSocket and re-arms the background "Hey Aira" wake-word listener so
   * it is ready again once the user returns to /machinescreen1.
   */
  function handleEndVoiceSession() {
    stopAllVoiceAudio();
    deactivateVoice();
  }

  function newChat() {
    stopMessagePlayback();
    resetChatSessionId();
    setMessages([welcomeMessage(lang), quickActionsMessage(lang)]);
    setCtx({ ...makeInitialContext(), lang });
    setHiddenSuggestionsForMessageId(null);
    setShowNewChatConfirm(false);
  }

  return (
    <div className="aira-chat-container">
      {/* 🧪 TEMPORARY TEST COMPONENT */}
      {/* <VADTest /> */}
      <AssistantHeader lang={lang} onLangChange={setLang} onNewChat={() => setShowNewChatConfirm(true)} />
      {voiceSnapshot.errorMessage && (
        voiceSnapshot.errorMessage === 'Reconnecting voice...' ? (
          <div role="status" className="aira-voice-status-pill">
            <i className="bi bi-arrow-repeat" aria-hidden="true" />{' '}
            {lang === 'ar'
              ? 'جارٍ إعادة الاتصال بالصوت...'
              : lang === 'hi'
              ? 'वॉइस पुनः कनेक्ट हो रहा है...'
              : 'Reconnecting voice...'}
          </div>
        ) : (
          <div role="alert" className="aira-voice-error">
            <span>{voiceSnapshot.errorMessage}</span>
            {voiceSnapshot.state === 'ERROR' && !voiceSnapshot.errorMessage.includes('Microphone access is blocked') && (
              <Button size="sm" variant="link" onClick={openVoice}>
                {lang === 'ar' ? 'إعادة الاتصال' : lang === 'hi' ? 'पुनः कनेक्ट करें' : 'Reconnect'}
              </Button>
            )}
          </div>
        )
      )}
   {interruption && (
  <div className="d-flex flex-wrap gap-2 align-items-center px-3 py-2">

    {interruption !== 'resumed' && (
      <Button
        size="sm"
        disabled={interruption === 'resuming'}
        onClick={() => {
          setResumeError(false);
          void ttsService.resumeInterrupted().catch(() => setResumeError(true));
        }}
        className="aira-audio-pill"
      >
        <i className="bi bi-play-circle me-1"></i>
        {interruption === 'resuming'
          ? 'Resuming...'
          : lang === 'ar'
          ? 'استئناف الصوت'
          : lang === 'hi'
          ? 'ऑडियो जारी रखें'
          : 'Resume audio'}
      </Button>
    )}

    <Button
      size="sm"
      onClick={() => {
        setResumeError(false);
        stopMessagePlayback();
      }}
      className="aira-audio-pill"
    >
      <i className="bi bi-stop-circle me-1"></i>
      {lang === 'ar'
        ? 'إيقاف الصوت'
        : lang === 'hi'
        ? 'ऑडियो रोकें'
        : 'Stop audio'}
    </Button>

    {resumeError && (
      <span role="alert" className="small text-danger">
        {lang === 'ar'
          ? 'تعذر استئناف الصوت.'
          : lang === 'hi'
          ? 'ऑडियो जारी नहीं हो सका।'
          : 'Audio could not resume.'}
      </span>
    )}
  </div>
)}
      <div ref={scrollRef} className="aira-chat-scroll aira-glass">
        <div className="mx-auto d-flex flex-column gap-3" style={{ maxWidth: '42rem' }}>
          {messages.filter((message): message is ChatMessage => Boolean(message)).map((m) => (
            <div key={m.id} className="aira-fade-in">
              <ChatMessageView message={m} lang={lang} onAction={handleAction} />
            </div>
          ))}
        </div>
      </div>

      <ChatInput
        lang={lang}
        disabled={busy}
        voiceSupported={isVoiceSupported()}
        suggestedActions={latestSuggestedActions}
        onSend={handleSendMessage}
        onQuickReply={(action) => {
          if (action.id === 'voice-input' || action.icon === 'mic' || action.payload === 'Ask by Voice') {
            openVoice();
            return;
          }
          handleSendMessage(action.payload || action.label);
        }}
        onVoice={openVoice}
        onLangChange={setLang}
        /** Mode A: while a manual voice session runs, the composer morphs
            into the inline voice dock instead of the text input. */
        voiceDockOverride={
          isVoiceActive && voiceActivationSource === 'manual' ? (
            <InlineVoiceDock
              voiceState={voiceSnapshot.state}
              audioLevel={voiceSnapshot.audioLevel}
              errorMessage={voiceSnapshot.errorMessage}
              lang={lang}
              onExit={handleEndVoiceSession}
              onStopPlayback={cancelPlayback}
            />
          ) : null
        }
      />

      {/* Mode B: full-screen AIR₂O orb overlay — only for wake-word sessions.
          Manual sessions keep the chat log visible via the inline dock. */}
      {isVoiceActive && voiceActivationSource === 'wake_word' && (
        <VoiceModeOverlay
          voiceState={voiceSnapshot.state}
          audioLevel={voiceSnapshot.audioLevel}
          transcript={voiceSnapshot.transcript}
          errorMessage={voiceSnapshot.errorMessage}
          lang={lang}
          onEndSession={handleEndVoiceSession}
          onSwitchToKeyboard={handleEndVoiceSession}
          onStopPlayback={cancelPlayback}
        />
      )}

      <Modal show={showVoiceUnsupported} onHide={() => setShowVoiceUnsupported(false)} centered className="aira-glass">
        <Modal.Body className="text-center p-4">
          <p className="text-muted">{t(lang).voiceUnsupported}</p>
          <Button variant="primary" className="aira-action-btn w-100 mt-3" onClick={() => setShowVoiceUnsupported(false)}>
            {t(lang).typeInstead}
          </Button>
        </Modal.Body>
      </Modal>

      <Modal show={showNewChatConfirm} onHide={() => setShowNewChatConfirm(false)} centered className="aira-glass">
        <Modal.Body className="text-center p-4">
          <p className="fw-semibold">{t(lang).newChatConfirm}</p>
          <div className="mt-3 d-flex gap-2">
            <Button variant="light" className="aira-action-btn flex-grow-1" onClick={() => setShowNewChatConfirm(false)}>
              {t(lang).cancel}
            </Button>
            <Button variant="primary" className="aira-action-btn flex-grow-1" onClick={newChat} style={{ backgroundColor: '#1A83B1', borderColor: '#1A83B1' }}>
              {t(lang).newChatBtn}
            </Button>
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
}

function findLatestSuggestedMessage(messages: ChatMessage[], hiddenMessageId: string | null) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (message.role !== 'assistant') continue;
    if (!message.suggestedActions?.length) continue;
    if (message.id === hiddenMessageId) continue;
    return message;
  }

  return null;
}

function getLatestSuggestedActions(messages: ChatMessage[], hiddenMessageId: string | null): SuggestedAction[] {
  return findLatestSuggestedMessage(messages, hiddenMessageId)?.suggestedActions ?? [];
}
