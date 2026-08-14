import type { SuggestedAction } from '../types';

export function QuickReplyBar({
  actions,
  disabled,
  onSelect,
}: {
  actions: SuggestedAction[];
  disabled: boolean;
  onSelect: (action: SuggestedAction) => void;
}) {
  if (!actions.length) return null;

  return (
    <div className="aira-quick-reply-shell">
      <div className="aira-quick-reply-bar" role="toolbar" aria-label="Suggested replies">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            className="aira-quick-reply-chip"
            onClick={() => onSelect(action)}
            aria-label={action.label}
          >
            {action.icon && <QuickReplyIcon icon={action.icon} />}
            <span className="aira-quick-reply-label">{action.label}</span>
          </button>
        ))}
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