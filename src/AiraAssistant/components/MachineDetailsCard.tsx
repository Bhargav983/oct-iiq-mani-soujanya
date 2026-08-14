import { Button, Card } from 'react-bootstrap';
import type { Machine, Language } from '../types';
import { t } from '../i18n/strings';
import { StatusBadge } from './StatusBadge';

export function MachineDetailsCard({
  machine,
  lang,
  onAction,
}: {
  machine: Machine;
  lang: Language;
  onAction: (a: { type: string; machineId: string }) => void;
}) {
  const s = t(lang);
  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body">
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-bold fs-5">{machine.service_item_name}</h6>
          <StatusBadge online={machine.is_online} error={machine.error} lang={lang} />
        </div>
        <div className="mt-3">
          <Row label={s.location} value={machine.location} />
          <Row label={s.serviceId} value={machine.service_item_id} />
          <Row label={s.warranty} value={fmtDate(machine.warranty_end_date)} />
          <Row label={s.contract} value={fmtDate(machine.contract_end_date)} />
        </div>
      </Card.Body>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="d-flex justify-content-between py-1 border-bottom border-light">
      <span className="text-muted small">{label}</span>
      <span className="fw-semibold small">{value}</span>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
