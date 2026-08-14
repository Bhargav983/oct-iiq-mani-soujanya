import { Button, Card } from 'react-bootstrap';
import type { Language } from '../types';
import { t } from '../i18n/strings';

export function ConfirmationCard({
  machineName,
  label,
  lang,
  onAction,
}: {
  machineName: string;
  label: string;
  lang: Language;
  onAction: (a: { type: string }) => void;
}) {
  const s = t(lang);
  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body">
        <p className="fw-semibold text-uppercase" style={{ color: '#1A83B1' }}>{s.confirmChangeTitle}</p>
        <p className="mt-2 fw-semibold small">
          {machineName} — {label}?
        </p>
        <div className="mt-3 d-flex gap-2">
          <Button variant="light" className="aira-action-btn" onClick={() => onAction({ type: 'cancelChange' })}>
            {s.cancel}
          </Button>
          <Button variant="primary" className="aira-action-btn" onClick={() => onAction({ type: 'confirmChange' })} style={{ 
            backgroundColor: '#1A83B1', 
            borderColor: '#1A83B1', 
            color: '#fff'
          }}>
            <i className="bi bi-check-circle me-1" /> {s.confirm}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export function SuccessCard({ text, lang }: { text: string; lang: Language }) {
  const s = t(lang);
  return (
    <Card className="aira-card aira-glass border-success" style={{ background: '#ecfdf5' }}>
      <Card.Body className="aira-card-body d-flex align-items-start gap-2">
        <i className="bi bi-check-circle-fill text-success mt-1" style={{ fontSize: '1.25rem' }} />
        <div>
          <p className="fw-bold text-success mb-0 small">{s.commandSent}</p>
          <p className="small text-secondary mb-0 mt-1">{text}</p>
        </div>
      </Card.Body>
    </Card>
  );
}
