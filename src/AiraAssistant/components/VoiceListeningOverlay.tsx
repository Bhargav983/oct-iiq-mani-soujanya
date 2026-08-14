import type { Language } from '../types';
import { t } from '../i18n/strings';

export function VoiceListeningOverlay({
  lang,
  transcript,
  onStop,
  onCancel,
  onRetry,
  onTypeInstead,
  done,
  listening,
  audioLevel,
  wakeWordEnabled,
}: {
  lang: Language;
  transcript: string;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onTypeInstead: () => void;
  done: boolean;
  listening: boolean;
  audioLevel: number;
  wakeWordEnabled: boolean;
}) {
  const s = t(lang);
  return (
    <div className="aira-voice-pill" role="status" aria-live="polite">
      <div className="aira-voice-wave" aria-hidden="true">
        {[0.55, 0.8, 1, 0.72, 0.6, 0.92, 0.66].map((base, index) => (
          <span key={index} style={{ transform: `scaleY(${Math.max(0.22, base * (0.45 + audioLevel * 1.5))})` }} />
        ))}
      </div>
      <div className="aira-voice-pill-copy">
        <strong>{done ? 'Ready to send' : listening ? s.listening : 'Voice mode'}</strong>
        <span>{done ? transcript : transcript || (wakeWordEnabled ? 'Say "Hey AIRA" anytime' : 'Preparing microphone...')}</span>
      </div>
      {done ? (
        <div className="aira-voice-pill-actions">
          <button type="button" onClick={() => onTypeInstead()} aria-label={s.typeInstead}><i className="bi bi-keyboard" /></button>
          <button type="button" onClick={onRetry} aria-label={s.tryAgain}><i className="bi bi-arrow-clockwise" /></button>
          <button type="button" className="aira-voice-send" onClick={onStop} aria-label="Send voice message"><i className="bi bi-send-fill" /></button>
        </div>
      ) : (
        <div className="aira-voice-pill-actions">
          <button type="button" onClick={onCancel} aria-label={s.cancel}><i className="bi bi-x-lg" /></button>
          <button type="button" className="aira-voice-stop" onClick={onStop} aria-label={s.stop}><i className="bi bi-stop-fill" /></button>
        </div>
      )}
    </div>
  );
}
