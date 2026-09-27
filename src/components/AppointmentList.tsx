import { Link } from 'react-router-dom';
import type { Appointment } from '../../shared/types';
import { formatDateShortWithYear, formatTime, formatTimeRange } from '../../shared/dates';
import { REPEAT_LABELS } from '../../shared/recurrence';
import { PaymentBadge, StatusBadge } from './Badges';
import { Icon } from './Icon';

interface AppointmentListProps {
  appointments: Appointment[];
  /** Show the date on each row (client history) instead of only the time (one day). */
  showDate?: boolean;
  showClient?: boolean;
  highlightId?: number | null;
  emptyMessage?: string;
}

/** A list of cleanings in time order. Each row opens the cleaning's details. */
export function AppointmentList({
  appointments,
  showDate = false,
  showClient = true,
  highlightId = null,
  emptyMessage = 'No cleanings.',
}: AppointmentListProps) {
  if (!appointments.length) return <p className="empty-inline">{emptyMessage}</p>;
  return (
    <ul className="appointment-list">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <Link
            to={`/appointments/${appointment.id}`}
            className={`appointment-row status-${appointment.status}${appointment.id === highlightId ? ' is-next' : ''}`}
          >
            <div className="appointment-row-when">
              {showDate && <span className="appointment-row-date">{formatDateShortWithYear(appointment.date)}</span>}
              <span className="appointment-row-time">
                {showDate ? formatTimeRange(appointment.time, appointment.durationMinutes) : formatTime(appointment.time)}
              </span>
            </div>
            <div className="appointment-row-main">
              {showClient && <span className="appointment-row-name">{appointment.client.name}</span>}
              {showClient && appointment.client.address && (
                <span className="appointment-row-address">{appointment.client.address}</span>
              )}
              {appointment.series && (
                <span className="appointment-row-repeat">
                  <Icon name="repeat" size={16} /> {REPEAT_LABELS[appointment.series.frequency]}
                </span>
              )}
            </div>
            <div className="appointment-row-status">
              {appointment.id === highlightId && <span className="badge badge-next">Next</span>}
              <StatusBadge status={appointment.status} />
              <PaymentBadge appointment={appointment} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
