import { Button, Card } from 'react-bootstrap';
import type { Language, QuickActionKey } from '../types';
import { t } from '../i18n/strings';

export function QuickActionGrid({
  lang,
  onAction,
}: {
  lang: Language;
  onAction: (key: QuickActionKey) => void;
}) {
  const s = t(lang);
  const items: { key: QuickActionKey; label: string; icon: string; color: string }[] = [
    { key: 'myMachines', label: s.qaMyMachines, icon: 'snow', color: '#eff6ff' },
    { key: 'offline', label: s.qaOffline, icon: 'wifi-off', color: '#f1f5f9' },
    { key: 'status', label: s.qaStatus, icon: 'exclamation-triangle', color: '#fff7ed' },
    { key: 'service', label: s.qaService, icon: 'wrench', color: '#fef2f2' },
    { key: 'controls', label: s.qaControls, icon: 'sliders', color: '#eff6ff' },
    { key: 'voice', label: s.qaVoice, icon: 'mic', color: '#f1f5f9' },
  ];
  return (
    <div className="aira-quick-grid aira-glass">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onAction(it.key)}
          className="aira-quick-btn"
        >
          <span className="aira-quick-icon" style={{ background: it.color }}>
            <i className={`bi bi-${it.icon}`} style={{ color: '#334155' }} />
          </span>
          <span className="fw-semibold small">{it.label}</span>
        </button>
      ))}
    </div>
  );
}
