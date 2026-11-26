import type { Language, SuggestedAction } from '../types';
import { t } from '../i18n/strings';

function localizedActionLabel(action: SuggestedAction, lang: Language): string {
  const s = t(lang);
  switch (action.id) {
    case 'my-machines': return s.qaMyMachines;
    case 'offline': return s.qaOffline;
    case 'status': return s.qaStatus;
    case 'error-logs': return s.qaViewErrorLogs;
    case 'service': return s.qaService;
    case 'controls': return s.qaControls;
    case 'voice-input': return s.qaVoice;
    default: return action.label;
  }
}

export function QuickReplyBar({
  actions,
  disabled,
  lang = 'en',
  onSelect,
}: {
  actions: SuggestedAction[];
  disabled: boolean;
  lang?: Language;
  onSelect: (action: SuggestedAction) => void;
}) {
  if (!actions.length) return null;

  return (
    <div className="aira-quick-reply-shell">
      <div className="aira-quick-reply-bar" role="toolbar" aria-label="Suggested replies">
        {actions.map((action) => {
          const label = localizedActionLabel(action, lang);
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              className="aira-quick-reply-chip"
              onClick={() => onSelect(action)}
              aria-label={label}
            >
              {action.icon && <QuickReplyIcon icon={action.icon} />}
              <span className="aira-quick-reply-label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuickReplyIcon({ icon }: { icon: string }) {
  const glyph = resolveBootstrapIcon(icon);
  return <i className={`bi bi-${glyph}`} aria-hidden="true" />;
}

function resolveBootstrapIcon(icon: string): string {
  const glyph = icon.toLowerCase();

  if (glyph === 'snowflake') return 'snow';
  if (glyph === 'microphone') return 'mic';
  if (glyph === 'alert' || glyph === 'warning') return 'exclamation-triangle';
  if (glyph === 'controls') return 'sliders';
  if (glyph === 'send' || glyph === 'arrow-right') return 'send-fill';

  return glyph;
}