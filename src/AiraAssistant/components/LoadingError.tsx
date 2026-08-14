import { Button, Card } from 'react-bootstrap';
import type { Language } from '../types';
import { t } from '../i18n/strings';

export function ErrorCard({
  lang,
  onAction,
}: {
  lang: Language;
  onAction: (a: { type: string; key?: string }) => void;
}) {
  const s = t(lang);
  const buttonStyle = { 
    backgroundColor: '#1A83B1', 
    borderColor: '#1A83B1', 
    color: '#fff',
    padding: '0.375rem 0.75rem',
    fontSize: '0.875rem',
    borderRadius: '2rem', // pill shape
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  };
  return (
    <Card className="aira-card aira-glass" style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '1rem' }}>
      <Card.Body className="aira-card-body d-flex flex-column align-items-center gap-4" style={{ padding: '1rem', textAlign: 'center' }}>
        <div className="d-flex align-items-center gap-3">
          <i className="bi bi-exclamation-triangle-fill" style={{ color: '#1A83B1', fontSize: '1.5rem' }} />
          <p className="fw-semibold text-muted small mb-0" style={{ fontSize: '0.875rem' }}>{s.errorGeneric}</p>
        </div>
        <div className="d-flex gap-3">
          <Button variant="primary" size="sm" className="aira-action-btn" onClick={() => onAction({ type: 'retry' })} style={buttonStyle}>
            <i className="bi bi-arrow-clockwise" /> {s.tryAgainBtn}
          </Button>
          <Button variant="primary" size="sm" className="aira-action-btn" onClick={() => onAction({ type: 'raiseService' })} style={buttonStyle}>
            <i className="bi bi-tools" /> {s.raiseService}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export function LoadingCard({ text }: { text: string }) {
  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body d-flex align-items-center gap-2">
        <div className="spinner-border spinner-border-sm text-primary" role="status" />
        <span className="small text-muted">{text}</span>
      </Card.Body>
    </Card>
  );
}
