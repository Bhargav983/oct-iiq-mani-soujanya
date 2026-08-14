import { Button } from 'react-bootstrap';
import type { Language } from '../types';
import { t } from '../i18n/strings';
import { LanguageSelector } from './LanguageSelector';
import air2oLogo from './Assets/octane-logo.svg';

export function AssistantHeader({
  lang,
  onLangChange,
  onNewChat,
}: {
  lang: Language;
  onLangChange: (l: Language) => void;
  onNewChat: () => void;
}) {
  const s = t(lang);
  return (
    <header
      className="sticky-top border-bottom bg-white aira-glass"
      style={{ backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.9)', zIndex: 1020 }}
    >
      <div className="mx-auto d-flex align-items-center gap-2 ps-2 pe-3 py-2" style={{ maxWidth: '42rem' }}>
        <div
        className="d-flex align-items-center justify-content-center rounded-3 p-1"
        style={{
          width: 44,
          height: 36,
          flexShrink: 0,
          background: 'rgba(241, 246, 248, 0.06)',
          border: '1px solid rgba(26, 131, 177, 0.15)',
          borderRadius: '10px',
        }}
      >
        <img
          src={air2oLogo}
          alt="AIR₂O"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <h1 className="mb-0 fw-bold fs-6 text-truncate">{s.headerTitle}</h1>
          <p className="mb-0 text-muted" style={{ fontSize: '0.75rem' }}>{s.headerSubtitle}</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
          style={{ width: 36, height: 36, backgroundColor: '#1A83B1', borderColor: '#1A83B1' }}
          onClick={onNewChat}
          aria-label={s.newChat}
        >
          <i className="bi bi-plus-lg" style={{ color: '#fff', fontSize: '1.1rem' }} />
        </Button>
      </div>
    </header>
  );
}
