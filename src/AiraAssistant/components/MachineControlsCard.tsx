import { useState } from 'react';
import { Button, Card } from 'react-bootstrap';
import type { Machine, Language, FanSpeed, MachineMode } from '../types';
import { t } from '../i18n/strings';
import { trFan, trMode } from './MachineStatusCard';

export function MachineControlsCard({
  machine,
  lang,
  onAction,
}: {
  machine: Machine;
  lang: Language;
  onAction: (a: { type: string; machineId: string; setting?: string; value?: any }) => void;
}) {
  const s = t(lang);
  const [power, setPower] = useState(machine.power);
  const [temp, setTemp] = useState(machine.set_temperature);
  const [fan, setFan] = useState<FanSpeed>(machine.fan_speed);
  const [mode, setMode] = useState<MachineMode>(machine.mode);

  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body">
        <h6 className="mb-0 fw-bold fs-5" text-center style={{ color: '#1A83B1' }}>
          {lang === 'ar' ? 'تحكم' : 'Control'} {machine.service_item_name}
        </h6>
        <div className="mt-3 d-flex flex-column gap-3 align-items-center">
          <Section label={s.power}>
            <div className="d-flex justify-content-center align-items-center gap-2">
              <Toggle active={power} onClick={() => { setPower(true); onAction({ type: 'setControl', machineId: machine.id, setting: 'power', value: true }); }}>
                <i className="bi bi-power me-1" /> {s.on}
              </Toggle>
              <Toggle active={!power} onClick={() => { setPower(false); onAction({ type: 'setControl', machineId: machine.id, setting: 'power', value: false }); }}>
                {s.off}
              </Toggle>
            </div>
          </Section>

          <Section label={s.temperature}>
            <div className="d-flex align-items-center justify-content-center gap-3">
              <RoundBtn onClick={() => { const v = Math.max(16, temp - 1); setTemp(v); onAction({ type: 'setControl', machineId: machine.id, setting: 'temperature', value: v }); }}>
                <i className="bi bi-dash-lg" />
              </RoundBtn>
              <div className="fw-bold fs-4" style={{ minWidth: 80, textAlign: 'center' }}>{temp}°C</div>
              <RoundBtn onClick={() => { const v = Math.min(30, temp + 1); setTemp(v); onAction({ type: 'setControl', machineId: machine.id, setting: 'temperature', value: v }); }}>
                <i className="bi bi-plus-lg" />
              </RoundBtn>
            </div>
          </Section>

          <Section label={s.fanSpeed}>
            <div className="d-flex flex-wrap justify-content-center align-items-center gap-2">
              {(['Low', 'Medium', 'High'] as FanSpeed[]).map((f) => (
                <Chip key={f} active={fan === f} onClick={() => { setFan(f); onAction({ type: 'setControl', machineId: machine.id, setting: 'fan', value: f }); }}>
                  {trFan(f, lang)}
                </Chip>
              ))}
            </div>
          </Section>

          <Section label={s.mode}>
            <div className="d-flex flex-wrap justify-content-center align-items-center gap-2">
              {(['Cooling', 'Fan', 'Auto'] as MachineMode[]).map((m) => (
                <Chip key={m} active={mode === m} onClick={() => { setMode(m); onAction({ type: 'setControl', machineId: machine.id, setting: 'mode', value: m }); }}>
                  {trMode(m, lang)}
                </Chip>
              ))}
            </div>
          </Section>
        </div>
      </Card.Body>
    </Card>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-100 d-flex flex-column align-items-center text-center">
      <div className="mb-2 fw-semibold text-muted small">{label}</div>
      {children}
    </div>
  );
}
function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      variant={active ? 'primary' : 'light'}
      className="aira-action-btn px-4"
      style={active ? { backgroundColor: '#1A83B1', borderColor: '#1A83B1', color: '#ffffff' } : undefined}
    >
      {children}
    </Button>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      variant={active ? 'primary' : 'light'}
      className="aira-action-btn px-3"
      style={active ? { backgroundColor: '#1A83B1', borderColor: '#1A83B1', color: '#ffffff', minHeight: 40 } : { minHeight: 40 }}
    >
      {children}
    </Button>
  );
}
function RoundBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      variant="light"
      className="d-flex align-items-center justify-content-center"
      style={{ width: 44, height: 44, borderRadius: '50%' }}
    >
      {children}
    </Button>
  );
}
