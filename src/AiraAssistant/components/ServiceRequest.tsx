import { useState } from 'react';
import { Button, Card } from 'react-bootstrap';
import type { Machine, Language, ServiceDraft, ServiceRequest } from '../types';
import { t } from '../i18n/strings';
import { MachineCard } from './MachineCard';

const PROBLEMS = ['notCooling', 'notTurningOn', 'strangeNoise', 'waterLeakage', 'tempProblem', 'other'] as const;
const DATES = ['today', 'tomorrow', 'chooseDate'] as const;
const TIMES = ['morning', 'afternoon', 'evening', 'chooseTime'] as const;

export function ServiceRequestStep({
  step,
  draft,
  machines,
  lang,
  onAction,
}: {
  step: number;
  draft: ServiceDraft;
  machines: Machine[];
  lang: Language;
  onAction: (a: { type: string; [k: string]: any }) => void;
}) {
  const s = t(lang);
  if (step === 1) {
    return (
      <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <StepHeader step={1} title={s.serviceStep1} question={s.serviceStep1Q} />
          <p className="mt-2 mb-3 small text-muted">{s.selectMachinePrompt}</p>
          {machines.map((m) => (
            <div key={m.id} onClick={() => onAction({ type: 'serviceSelectMachine', machineId: m.id })} style={{ cursor: 'pointer' }}>
              <MachineCard machine={m} lang={lang} compact onAction={() => onAction({ type: 'serviceSelectMachine', machineId: m.id })} />
            </div>
          ))}
        </Card.Body>
      </Card>
    );
  }
  if (step === 2) {
    return (
      <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <StepHeader step={2} title={s.serviceStep2} question={s.serviceStep2Q} />
          <div className="mt-3 d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {PROBLEMS.map((p) => (
              <Button
                key={p}
                variant={draft.problem === problemKey(p) ? 'primary' : 'outline-primary'}
                className="aira-action-btn"
                onClick={() => {
                  if (p === 'other') {
                    onAction({ type: 'serviceSelectProblem', problem: 'Other' });
                  } else {
                    onAction({ type: 'serviceSelectProblem', problem: problemKey(p) });
                  }
                }}
              >
                {problemLabel(p, lang)}
              </Button>
            ))}
          </div>
          {draft.problem === 'Other' && <OtherInput lang={lang} onAction={onAction} />}
        </Card.Body>
      </Card>
    );
  }
  if (step === 3) {
    return (
      <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <StepHeader step={3} title={s.serviceStep3} question={s.serviceStep3Q} />
          <div className="mt-3 d-grid gap-2">
            {DATES.map((d) => (
              <Button
                key={d}
                variant={draft.date === dateLabel(d, lang) ? 'primary' : 'outline-primary'}
                className="aira-action-btn"
                onClick={() => onAction({ type: 'serviceSelectDate', date: dateLabel(d, lang) })}
              >
                {d === 'chooseDate' && <i className="bi bi-calendar me-1" />}
                {dateLabel(d, lang)}
              </Button>
            ))}
          </div>
        </Card.Body>
      </Card>
    );
  }
  if (step === 4) {
    return (
      <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <StepHeader step={4} title={s.serviceStep4} question={s.serviceStep4Q} />
          <div className="mt-3 d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {TIMES.map((tm) => (
              <Button
                key={tm}
                variant={draft.time === timeLabel(tm, lang) ? 'primary' : 'outline-primary'}
                className="aira-action-btn"
                onClick={() => onAction({ type: 'serviceSelectTime', time: timeLabel(tm, lang) })}
              >
                {tm === 'chooseTime' && <i className="bi bi-clock me-1" />}
                {timeLabel(tm, lang)}
              </Button>
            ))}
          </div>
        </Card.Body>
      </Card>
    );
  }
  return <ServiceRequestSummary draft={draft} machines={machines} lang={lang} onAction={onAction} />;
}

function StepHeader({ step, title, question }: { step: number; title: string; question: string }) {
  return (
    <div>
      <div className="text-primary text-uppercase fw-bold small">{title}</div>
      <p className="mt-1 mb-0 fw-semibold">{question}</p>
    </div>
  );
}

function OtherInput({ lang, onAction }: { lang: Language; onAction: (a: any) => void }) {
  const s = t(lang);
  const [text, setText] = useState('');
  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={s.otherProblemPlaceholder}
        className="form-control"
        rows={2}
      />
      <div className="mt-2">
        <Button variant="outline-primary" className="aira-action-btn" disabled={!text.trim()} onClick={() => onAction({ type: 'serviceOtherText', text })}>
          {s.next}
        </Button>
      </div>
    </div>
  );
}

export function ServiceRequestSummary({
  draft,
  machines,
  lang,
  onAction,
}: {
  draft: ServiceDraft;
  machines: Machine[];
  lang: Language;
  onAction: (a: { type: string }) => void;
}) {
  const s = t(lang);
  const machine = machines.find((m) => m.id === draft.machineId);
  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-wrench text-primary" />
          <h6 className="mb-0 fw-bold">{s.serviceReview}</h6>
        </div>
        <div className="mt-3">
          <Row label={s.machine} value={machine?.service_item_name ?? '—'} />
          <Row label={s.problem} value={draft.problem === 'Other' ? draft.otherText || draft.problem : draft.problem} />
          <Row label={s.prefDate} value={draft.date} />
          <Row label={s.prefTime} value={draft.time} />
        </div>
        <div className="mt-3 d-flex gap-2">
          <Button variant="light" className="aira-action-btn" onClick={() => onAction({ type: 'serviceEdit' })}>
            {s.edit}
          </Button>
          <Button variant="primary" className="aira-action-btn" onClick={() => onAction({ type: 'serviceSubmit' })}>
            {s.submitRequest}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export function ServiceRequestSuccess({
  request,
  lang,
  onAction,
}: {
  request: ServiceRequest | null | undefined;
  lang: Language;
  onAction: (a: { type: string; requestId?: string }) => void;
}) {
  const s = t(lang);
  if (!request) {
    return (
      <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-check-circle-fill text-success" />
            <h6 className="mb-0 fw-bold text-success">{s.serviceSuccess}</h6>
          </div>
          <div className="mt-3 text-muted small">Request details are not available.</div>
        </Card.Body>
      </Card>
    );
  }
  return (
    <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <div className="d-flex align-items-center gap-2">
          <i className="bi bi-check-circle-fill text-success" />
          <h6 className="mb-0 fw-bold text-success">{s.serviceSuccess}</h6>
        </div>
        <div className="mt-3">
          <Row label={s.requestId} value={request.id} />
        </div>
        <div className="mt-3 d-flex justify-content-center align-items-center flex-wrap gap-2">
          <Button 
            variant="primary" 
            className="aira-action-btn" 
            style={{ backgroundColor: '#1A83B1', borderColor: '#1A83B1', color: '#ffffff' }}
            onClick={() => onAction({ type: 'viewRequestDetails', requestId: request.id })}
          >
            <i className="bi bi-file-text me-1" /> {s.viewRequestDetails}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export function ServiceRequestDetailsCard({
  request,
  lang,
}: {
  request: ServiceRequest | null | undefined;
  lang: Language;
}) {
  const s = t(lang);
  if (!request) {
    return (
      <Card className="aira-card aira-glass">
        <Card.Body className="aira-card-body">
          <h6 className="mb-0 fw-bold">{s.serviceReview}</h6>
          <div className="mt-3 text-muted small">No request data available.</div>
        </Card.Body>
      </Card>
    );
  }
  const statusLabel = request.status === 'Open' ? s.open : request.status === 'In Progress' ? s.inProgress : s.closed;
  return (
    <Card className="aira-card aira-glass">
      <Card.Body className="aira-card-body">
        <h6 className="mb-0 fw-bold" style={{ color: '#1A83B1' }}>{s.serviceReview}</h6>
        <div className="mt-3">
          <Row label={s.requestId} value={request.id} />
          <Row label={s.machine} value={request.machineName} />
          <Row label={s.problem} value={request.problem} />
          <Row label={s.status} value={statusLabel} />
          <Row label={s.prefDate} value={request.date} />
          <Row label={s.prefTime} value={request.time} />
          <Row label={s.created} value={request.created} />
        </div>
      </Card.Body>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="d-flex justify-content-between py-1 border-bottom border-light">
      <span className="text-muted small">{label}</span>
      <span className="fw-semibold small text-end">{value}</span>
    </div>
  );
}

function problemKey(p: string): string {
  const map: Record<string, string> = {
    notCooling: 'Not Cooling',
    notTurningOn: 'Not Turning On',
    strangeNoise: 'Strange Noise',
    waterLeakage: 'Water Leakage',
    tempProblem: 'Temperature Problem',
    other: 'Other',
  };
  return map[p] ?? p;
}
function problemLabel(p: string, lang: Language): string {
  const s = t(lang);
  const map: Record<string, string> = {
    notCooling: s.notCooling,
    notTurningOn: s.notTurningOn,
    strangeNoise: s.strangeNoise,
    waterLeakage: s.waterLeakage,
    tempProblem: s.tempProblem,
    other: s.other,
  };
  return map[p];
}
function dateLabel(d: string, lang: Language): string {
  const s = t(lang);
  if (d === 'today') return s.today;
  if (d === 'tomorrow') return s.tomorrow;
  if (d === 'chooseDate') return s.chooseDate;
  return d;
}
function timeLabel(tm: string, lang: Language): string {
  const s = t(lang);
  if (tm === 'morning') return s.morning;
  if (tm === 'afternoon') return s.afternoon;
  if (tm === 'evening') return s.evening;
  if (tm === 'chooseTime') return s.chooseTime;
  return tm;
}
