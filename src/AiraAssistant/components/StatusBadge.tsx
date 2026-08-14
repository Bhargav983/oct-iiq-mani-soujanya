import { Badge } from 'react-bootstrap';
import type { Language } from '../types';
import { t } from '../i18n/strings';

export function StatusBadge({
  online,
  error,
  lang,
}: {
  online: boolean;
  error?: string | null;
  lang: Language;
}) {
  const s = t(lang);
  if (!online) {
    return (
      <Badge bg="secondary" className="d-inline-flex align-items-center gap-1">
        <span className="aira-status-dot offline" />
        {s.offline}
      </Badge>
    );
  }
  if (error) {
    return (
      <Badge bg="warning" text="dark" className="d-inline-flex align-items-center gap-1">
        <span className="aira-status-dot attention" />
        {s.attention}
      </Badge>
    );
  }
  return (
    <Badge bg="success" className="d-inline-flex align-items-center gap-1">
      <span className="aira-status-dot online" />
      {s.online}
    </Badge>
  );
}
