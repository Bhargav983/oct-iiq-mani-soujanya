import { Button, Card } from 'react-bootstrap';
import type { Machine, Language } from '../types';
import { t } from '../i18n/strings';
import { StatusBadge } from './StatusBadge';

export function MachineStatusCard({
  machine,
  lang,
  onAction,
}: {
  machine: Machine;
  lang: Language;
  onAction: (a: { type: string; machineId: string }) => void;
}) {
  const s = t(lang);
  if (!machine.is_online) {
    return (
      <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-0 fw-bold fs-5">{machine.service_item_name}</h6>
            <StatusBadge online={false} lang={lang} />
          </div>
          <div className="mt-3 rounded-3 bg-light p-3 small text-muted">
            {lang === 'ar' ? 'لا يمكن قراءة الحالة لأن الجهاز غير متصل.' : 'Status is unavailable because this machine is offline.'}
          </div>
          <div className="mt-3">
            <Button variant="outline-primary" size="sm" className="aira-action-btn" onClick={() => onAction({ type: 'raiseService', machineId: machine.id })}>
              {s.raiseService}
            </Button>
          </div>
        </Card.Body>
      </Card>
    );
  }
  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body">
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-bold fs-5">{machine.service_item_name}</h6>
          <StatusBadge online={machine.is_online} error={machine.error} lang={lang} />
        </div>
        <div className="mt-3 row g-2">
          <Metric icon="thermometer-half" label={s.roomTemp} value={`${machine.room_temperature}°C`} />
          <Metric icon="snow" label={s.setTemp} value={`${machine.set_temperature}°C`} />
          <Metric icon="wind" label={s.fanSpeed} value={trFan(machine.fan_speed, lang)} />
          <Metric icon="snow2" label={s.mode} value={trMode(machine.mode, lang)} />
          <Metric icon="droplet" label={s.humidity} value={`${machine.humidity}%`} />
          <Metric
            icon={machine.error ? 'exclamation-triangle' : 'check-circle'}
            label={s.error}
            value={machine.error ? machine.error : s.noError}
            danger={!!machine.error}
          />
        </div>
      </Card.Body>
    </Card>
  );
}

function Metric({ icon, label, value, danger }: { icon: string; label: string; value: string; danger?: boolean }) {
  return (
    <div className="col-6">
      <div className={'aira-metric' + (danger ? ' danger' : '')}>
        <div className="d-flex align-items-center gap-1 text-muted small">
          <i className={`bi bi-${icon}`} /> {label}
        </div>
        <div className={'mt-1 fw-bold' + (danger ? ' text-warning-emphasis' : '')}>{value}</div>
      </div>
    </div>
  );
}

export function trFan(speed: string, lang: Language): string {
  const s = t(lang);
  if (speed === 'Low') return s.low;
  if (speed === 'High') return s.high;
  return s.medium;
}
export function trMode(mode: string, lang: Language): string {
  const s = t(lang);
  if (mode === 'Cooling') return s.cool;
  if (mode === 'Fan') return s.fan;
  return s.auto;
}
