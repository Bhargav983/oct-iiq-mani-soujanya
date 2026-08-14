import { Button } from 'react-bootstrap';
import type { ChatMessage, Language, Action, Machine } from '../types';
import { t } from '../i18n/strings';
import { QuickActionGrid } from './QuickActionGrid';
import { MachineCard } from './MachineCard';
import { MachineDetailsCard } from './MachineDetailsCard';
import { MachineStatusCard } from './MachineStatusCard';
import { MachineControlsCard } from './MachineControlsCard';
import { ConfirmationCard, SuccessCard } from './ConfirmationCard';
import {
  ServiceRequestStep,
  ServiceRequestSuccess,
  ServiceRequestDetailsCard,
} from './ServiceRequest';
import { ErrorCard, LoadingCard } from './LoadingError';
import { getMachines } from '../services/machineService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRef } from 'react';

export function ChatMessageView({
  message,
  lang,
  onAction,
}: {
  message: ChatMessage;
  lang: Language;
  onAction: (a: Action) => void;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="aira-msg-row user">
        <div 
          className="aira-bubble user text-white" 
          style={{ backgroundColor: '#1A83B1', borderRadius: '16px 16px 2px 16px' }}
        >
          {message.text}
        </div>
        <div 
          className="aira-avatar user text-white d-flex align-items-center justify-content-center rounded-circle flex-shrink-0" 
          style={{ backgroundColor: '#1A83B1', width: 32, height: 32 }}
        >
          <i className="bi bi-person-fill" />
        </div>
      </div>
    );
  }

  return (
    <div className="aira-msg-row">
      <div 
        className="aira-avatar assistant d-flex align-items-center justify-content-center rounded-circle flex-shrink-0" 
        style={{ backgroundColor: 'rgba(26, 131, 177, 0.1)', color: '#1A83B1', width: 32, height: 32 }}
      >
        <i className="bi bi-snow" />
      </div>
      <div className="d-flex flex-column gap-2 flex-grow-1" style={{ minWidth: 0 }}>
        {renderAssistant(message, lang, onAction)}
        {message.text && message.kind !== 'text' && (
          <SpeakButton text={message.text} lang={lang} />
        )}
      </div>
    </div>
  );
}

function renderAssistant(
  message: ChatMessage,
  lang: Language,
  onAction: (a: Action) => void
) {
  const s = t(lang);
  switch (message.kind) {
    case 'text':
      if (message.data?.success) {
        return <SuccessCard text={message.text ?? ''} lang={lang} />;
      }
      return (
        <div className="d-flex flex-column gap-1">
          <div className="aira-bubble assistant">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Customize markdown components to match the app's styling
                p: ({ children }) => <p className="mb-2">{children}</p>,
                strong: ({ children }) => <strong className="fw-bold">{children}</strong>,
                em: ({ children }) => <em className="fst-italic">{children}</em>,
                ul: ({ children }) => <ul className="mb-2 ps-3">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 ps-3">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
              }}
            >
              {message.text || ''}
            </ReactMarkdown>
          </div>
          <SpeakButton text={message.text ?? ''} lang={lang} />
        </div>
      );

    case 'quickActions':
      return <QuickActionGrid lang={lang} onAction={(key) => onAction({ type: 'quick', key })} />;

    case 'machines':
      return (
        <div>
          <p className="small text-secondary mb-2">
            {lang === 'ar' ? 'إليك أجهزتك:' : 'Here are your machines:'}
          </p>
          {message.data.machines.map((m: Machine) => (
            <MachineCard key={m.id} machine={m} lang={lang} onAction={(a) => onAction(a as Action)} />
          ))}
        </div>
      );

    case 'machineDetails':
      return <MachineDetailsCard machine={message.data.machine} lang={lang} onAction={(a) => onAction(a as Action)} />;

    case 'statusSummary': {
      const { summary, offline } = message.data;
      return (
        <div>
          <div className="aira-card mb-2 aira-glass">
            <div className="aira-card-body">
              <h6 className="fw-bold mb-0">{s.status}</h6>
              <div className="mt-2 row text-center g-2">
                <Stat label={s.total} value={summary.total} color="text-dark" />
                <Stat label={s.online} value={summary.online} color="text-success" />
                <Stat label={s.offline} value={summary.offline} color="text-danger" />
              </div>
            </div>
          </div>
          {offline.length > 0 && (
            <>
              <p className="small text-secondary mb-2">
                {summary.offline} of {summary.total} {lang === 'ar' ? 'من أجهزتك غير متصلة.' : 'machines are offline.'}
              </p>
              {offline.map((m: Machine) => (
                <MachineCard key={m.id} machine={m} lang={lang} onAction={(a) => onAction(a as Action)} />
              ))}
            </>
          )}
        </div>
      );
    }

    case 'status':
      return <MachineStatusCard machine={message.data.machine} lang={lang} onAction={(a) => onAction(a as Action)} />;

    case 'controls':
      return <MachineControlsCard machine={message.data.machine} lang={lang} onAction={(a) => onAction(a as Action)} />;

    case 'confirmation':
      return (
        <ConfirmationCard
          machineName={message.data.machineName}
          label={message.data.label}
          lang={lang}
          onAction={(a) => onAction(a as Action)}
        />
      );

    case 'serviceStep':
      return (
        <ServiceRequestStep
          step={message.data.step}
          draft={message.data.draft}
          machines={getMachines()}
          lang={lang}
          onAction={(a) => onAction(a as Action)}
        />
      );

    case 'serviceSuccess':
      return <ServiceRequestSuccess request={message.data.request} lang={lang} onAction={(a) => onAction(a as Action)} />;

    case 'serviceDetails':
      return <ServiceRequestDetailsCard request={message.data.request} lang={lang} />;

    case 'loading':
      return <LoadingCard text={message.loadingText ?? '...'} />;

    case 'error':
      return <ErrorCard lang={lang} onAction={(a) => onAction(a as Action)} />;

    default:
      return null;
  }
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="col-4">
      <div className="rounded-3 bg-light p-2">
        <div className={'fs-4 fw-bold ' + color}>{value}</div>
        <div className="small text-muted">{label}</div>
      </div>
    </div>
  );
}

function SpeakButton({ text, lang }: { text: string; lang: Language }) {
  const s = t(lang);
  if (!text) return null;
  return (
    <Button
      variant="light"
      size="sm"
      className="d-inline-flex align-items-center gap-1 rounded-pill py-1 border-0"
      style={{
        width: 'fit-content',
        fontSize: '0.75rem',
        backgroundColor: 'rgba(26, 131, 177, 0.08)',
        color: '#1A83B1',
        fontWeight: 500,
      }}
      onClick={() => speak(text, lang)}
    >
      <i className="bi bi-volume-up" style={{ color: '#1A83B1' }} /> {s.listen}
    </Button>
  );
}

export function speak(text: string, lang: Language) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    const voices = window.speechSynthesis.getVoices();
    
    // Select preferred voice (natural sounding voices)
    const preferred = voices.find(v => 
      v.name.includes("Google") || 
      v.name.includes("Microsoft") || 
      v.name.includes("Apple") ||
      v.name.includes("Natural")
    ) || voices.find(v => v.lang.startsWith(lang === 'ar' ? 'ar' : lang === 'hi' ? 'hi' : 'en'));
    
    const u = new SpeechSynthesisUtterance(stripEmoji(text));
    u.lang = lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-US';
    
    // Use selected voice if available
    if (preferred) {
      u.voice = preferred;
    }
    
    // Improve speech quality with better rate and pitch
    u.rate = 0.9;  // Slightly slower for clarity
    u.pitch = 1.1; // Slightly higher pitch for less robotic sound
    u.volume = 1;
    
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

function stripEmoji(t: string): string {
  return t.replace(/(?:[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF])/g, '').trim();
}
