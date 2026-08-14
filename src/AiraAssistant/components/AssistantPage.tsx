import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import type { Action, ChatMessage, Language, QuickActionKey, SuggestedAction } from '../types';
import { t } from '../i18n/strings';
import { AssistantHeader } from './AssistantHeader';
import { ChatInput } from './ChatInput';
import { ChatMessageView } from './ChatMessage';
import { VoiceListeningOverlay } from './VoiceListeningOverlay';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { defaultSuggestedActions, dispatch, makeInitialContext } from '../services/chatService';
import { callAssistant, mapResponse } from '../services/api';
import { getMachines } from '../services/machineService';
import type { ChatContext } from '../types';
import { createMessageId } from '../utils/messageId';

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

export function AssistantPage() {
  const [lang, setLang] = useState<Language>('en');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage('en'), quickActionsMessage('en')]);
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<ChatContext>(() => makeInitialContext());
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const [showVoiceUnsupported, setShowVoiceUnsupported] = useState(false);
  const [hiddenSuggestionsForMessageId, setHiddenSuggestionsForMessageId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceAssistant(async (text) => {
    await handleSendMessage(text);
  }, lang);

  const latestSuggestedActions = getLatestSuggestedActions(messages, hiddenSuggestionsForMessageId);

  // Initial machine fetch on app startup
  useEffect(() => {
    if (getMachines().length === 0) {
      // Silent background fetch from n8n
      callAssistant("My Machines")
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
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  async function handleAction(action: Action) {
    // Intercept voice action and launch voice recognition instead of calling n8n
    if (action.type === 'quick' && action.key === 'voice') {
      openVoice();
      return;
    }

    if (busy) return;
    hideCurrentSuggestions();
    const currentLang = ctx.lang;
    const userText = userTextFor(action, currentLang);
    const userMsg = userText
      ? [{ id: createMessageId('m'), role: 'user' as const, kind: 'text' as const, text: userText, timestamp: Date.now() } satisfies ChatMessage]
      : [];
    setMessages((prev) => [...prev, ...userMsg]);
    setBusy(true);

    const result = dispatch(action, { ...ctx, lang });

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
        if (action.key === 'offline') return s.qaOffline;
        if (action.key === 'status') return s.qaStatus;
        if (action.key === 'service') return s.qaService;
        if (action.key === 'controls') return s.qaControls;
        if (action.key === 'voice') return null;
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
    if (!voice.supported) {
      setShowVoiceUnsupported(true);
      return;
    }
    voice.start();
  }

  function newChat() {
    setMessages([welcomeMessage(lang), quickActionsMessage(lang)]);
    setCtx({ ...makeInitialContext(), lang });
    setHiddenSuggestionsForMessageId(null);
    setShowNewChatConfirm(false);
  }

  return (
    <div className="aira-chat-container">
      <AssistantHeader lang={lang} onLangChange={setLang} onNewChat={() => setShowNewChatConfirm(true)} />

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
        voiceSupported={voice.supported}
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
      />

      {(voice.listening || voice.done) && (
        <VoiceListeningOverlay
          lang={lang}
          transcript={voice.transcript}
          done={voice.done}
          onStop={voice.done ? () => void voice.accept() : voice.stop}
          onCancel={voice.cancel}
          onRetry={() => { voice.cancel(); voice.start(); }}
          onTypeInstead={voice.cancel}
          listening={voice.listening}
          audioLevel={voice.audioLevel}
          wakeWordEnabled={voice.wakeWordEnabled}
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
