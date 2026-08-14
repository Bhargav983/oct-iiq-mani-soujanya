import { Button, Card } from 'react-bootstrap';
import type { Machine, Language } from '../types';
import { t } from '../i18n/strings';
import { StatusBadge } from './StatusBadge';

export function MachineCard({
  machine,
  lang,
  onAction,
  compact = false,
}: {
  machine: Machine;
  lang: Language;
  onAction: (a: { type: string; machineId: string }) => void;
  compact?: boolean;
}) {
  const s = t(lang);
  return (
    <Card className="aira-card mb-2 aira-machine-card aira-glass">
      <Card.Body className="aira-card-body">
        <div className="aira-machine-row">
          <div className="aira-machine-info">
            <span className="fw-semibold text-truncate">{machine.service_item_name}</span>
            <StatusBadge online={machine.is_online} error={machine.error} lang={lang} />
            <small className="text-muted ms-2 aira-service-id">{s.serviceId}: {machine.service_item_id}</small>
          </div>
          <div className="aira-machine-actions">
           
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
