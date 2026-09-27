import type { ConflictInfo } from '../../shared/types';
import { formatDateFriendly, formatTimeRange } from '../../shared/dates';
import { Icon } from './Icon';

interface ConflictNoticeProps {
  conflict: ConflictInfo;
  onChangeTime: () => void;
  onBookAnyway: () => void;
  busy?: boolean;
}

/** Shown instead of silently double-booking. */
export function ConflictNotice({ conflict, onChangeTime, onBookAnyway, busy }: ConflictNoticeProps) {
  const other = conflict.appointment;
  return (
    <div className="conflict" role="alert">
      <p className="conflict-title">
        <Icon name="alert" />
        You already have a cleaning scheduled around this time.
      </p>
      <div className="conflict-card">
        <strong>{other.client.name}</strong>
        <span>{formatDateFriendly(other.date)}</span>
        <span>{formatTimeRange(other.time, other.durationMinutes)}</span>
      </div>
      <div className="button-row">
        <button type="button" className="btn btn-large btn-primary" onClick={onChangeTime} data-autofocus>
          Change Time
        </button>
        <button type="button" className="btn btn-secondary" onClick={onBookAnyway} disabled={busy}>
          Book It Anyway
        </button>
      </div>
    </div>
  );
}
