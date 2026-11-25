import { Button, Card } from 'react-bootstrap';
import { useEffect, useRef, useState } from 'react';
import type { Language } from '../types';
import { t } from '../i18n/strings';
import { useVoiceAssistantContext } from '../context/VoiceAssistantContext';
import { setMachineTemperature, validSetpoint, type TemperatureCommand } from '../services/temperatureCommand';

export function ConfirmationCard({
  machineName,
  label,
  lang,
  onAction,
  temperatureConfirmation,
  temperatureCommand,
}: {
  machineName: string;
  label: string;
  lang: Language;
  onAction: (a: { type: string }) => void;
  temperatureConfirmation?: boolean;
  temperatureCommand?: TemperatureCommand;
}) {
  const s = t(lang);
  const { userId, companyId } = useVoiceAssistantContext();
  const request = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('');
  const [finished, setFinished] = useState(false);
  const [pending, setPending] = useState(false);
  const valid = temperatureCommand && validSetpoint(temperatureCommand.temperature);
  useEffect(() => () => request.current?.abort(), [userId, companyId]);

  async function confirm() {
    if (!temperatureConfirmation) { onAction({ type: 'confirmChange' }); return; }
    if (!temperatureCommand || !valid || request.current || finished) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setStatus('Sending temperature command…');
    let sent = false;
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const result = await setMachineTemperature(temperatureCommand, { userId, companyId }, () => {
        sent = true;
        setStatus('Command sent. Waiting for the machine to report the new temperature…');
      }, controller.signal);
      setStatus(result === 'updated' ? 'Temperature updated.' : 'Command sent. The machine has not confirmed the new temperature.');
    } catch (error) {
      setStatus(controller.signal.aborted
        ? (sent ? 'Command sent. The machine has not confirmed the new temperature.' : 'The request timed out. Check the machine before trying again.')
        : error instanceof Error ? error.message : 'Unable to update the temperature.');
    } finally {
      window.clearTimeout(timeout);
      request.current = null;
      setPending(false);
      setFinished(true);
    }
  }

  function cancel() {
    if (!temperatureConfirmation) { onAction({ type: 'cancelChange' }); return; }
    setFinished(true);
    setStatus('Temperature change cancelled.');
  }
  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body">
        <p className="fw-semibold text-uppercase" style={{ color: '#1A83B1' }}>{s.confirmChangeTitle}</p>
        <p className="mt-2 fw-semibold small">
          {machineName} — {valid ? `Set temperature to ${temperatureCommand.temperature}°C` : label}?
        </p>
        {temperatureConfirmation && !valid && <p role="status">Choose the machine and a temperature from Control Machine to confirm this change.</p>}
        {status && <p role="status" className="small mb-0">{status}</p>}
        {!finished && (!temperatureConfirmation || valid) && <div className="mt-3 d-flex gap-2">
          <Button variant="light" className="aira-action-btn" disabled={pending} onClick={cancel}>
            {s.cancel}
          </Button>
          <Button variant="primary" className="aira-action-btn" disabled={pending} onClick={() => { void confirm(); }} style={{
            backgroundColor: '#1A83B1', 
            borderColor: '#1A83B1', 
            color: '#fff'
          }}>
            <i className="bi bi-check-circle me-1" /> {s.confirm}
          </Button>
        </div>}
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
