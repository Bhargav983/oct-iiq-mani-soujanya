import type { Language, ErrorLogItem, ErrorLogsCardData } from '../types';
import { t } from '../i18n/strings';

export function ErrorAnalyticsCard({
  data,
  lang,
  onRaiseServiceRequest,
}: {
  data: ErrorLogsCardData;
  lang: Language;
  onRaiseServiceRequest: (error: ErrorLogItem, pcb_serial_number: string) => void;
}) {
  const s = t(lang);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString(lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  const getPriorityClass = (priority: string) => {
    const p = priority.toLowerCase();
    if (p === 'critical') return 'critical';
    if (p === 'high') return 'high';
    return 'medium';
  };

  return (
    <div className="aira-error-card">
      {/* Header */}
      <div className="aira-error-card-header">
        <div className="aira-error-card-title-group">
          <div className="aira-error-card-icon-badge">
            <i className="bi bi-exclamation-triangle-fill" />
          </div>
          <div>
            <div className="aira-error-card-title">{data.pcb_serial_number}</div>
            <div className="aira-error-card-subtitle">Error Logs</div>
          </div>
        </div>
        <div className="aira-error-card-status">
          <span
            className="aira-status-dot"
            style={{ background: data.is_online ? '#10b981' : '#94a3b8' }}
          />
          <span>{data.is_online ? s.online : s.offline}</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="aira-error-card-stats">
        <div className="aira-error-card-stat-box">
          <span className="aira-error-card-stat-val">{data.total_error_count}</span>
          <span className="aira-error-card-stat-lbl">Total</span>
        </div>
        <div className="aira-error-card-stat-box critical">
          <span className="aira-error-card-stat-val critical">{data.critical_error_count}</span>
          <span className="aira-error-card-stat-lbl">Critical</span>
        </div>
        <div className="aira-error-card-stat-box">
          <span className="aira-error-card-stat-val">
            {Math.max(0, data.total_error_count - data.critical_error_count)}
          </span>
          <span className="aira-error-card-stat-lbl">Other</span>
        </div>
      </div>

      {/* Error List */}
      {data.top_critical_errors && data.top_critical_errors.length > 0 && (
        <div className="aira-error-card-list">
          <div className="aira-error-card-list-header">Top Critical Errors</div>
          {data.top_critical_errors.map((error) => (
            <div key={error.id} className="aira-error-item">
              <div className="aira-error-item-info">
                <div className="aira-error-item-header">
                  <span className={`aira-error-priority-badge ${getPriorityClass(error.priority)}`}>
                    {error.priority.toUpperCase()}
                  </span>
                  <span className="aira-error-code">Code {error.error_code}</span>
                  <span className="aira-error-timestamp">{formatTimestamp(error.timestamp)}</span>
                </div>
                <div className="aira-error-desc">{error.description}</div>
              </div>
              <button
                type="button"
                className="aira-error-raise-btn"
                onClick={() => onRaiseServiceRequest(error, data.pcb_serial_number)}
                title="Raise Service Request"
              >
                <i className="bi bi-wrench-adjustable" />
                <span>Raise Request</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}