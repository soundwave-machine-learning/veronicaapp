import { Link } from 'react-router-dom';
import type { Appointment } from '../../shared/types';
import { formatDateLong, formatDateFriendly, formatTime, formatTimeRange, formatDateShort } from '../../shared/dates';
import { formatPrice } from '../../shared/validation';
import { api, errorMessage } from '../api';
import { AppointmentList } from '../components/AppointmentList';
import { ContactActions } from '../components/ContactActions';
import { Icon } from '../components/Icon';
import { useQuickAdd } from '../components/QuickAdd';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useAppointments, useChange, useNextAfter, useSettings, useToday, useUnpaid } from '../hooks';
import { DEFAULT_BUSINESS_NAME } from '../../shared/templates';

/** The home screen: today's date, how many cleanings, the next one, and the day's list. */
export function TodayPage() {
  const today = useToday();
  const addCleaning = useQuickAdd();
  const { data: settings } = useSettings();
  const appointments = useAppointments(today, today);
  const list = appointments.data ?? [];
  const active = list.filter((a) => a.status !== 'canceled');
  const done = active.filter((a) => a.status === 'completed').length;
  const next = list.find((a) => a.status === 'scheduled') ?? null;
  const upcoming = useNextAfter(today, appointments.isSuccess && !next);

  return (
    <div className="page page-today">
      <header className="today-header">
        <p className="today-date">{formatDateLong(today)}</p>
        <div className="today-title-row">
          <div>
            <h1 className="page-title">Today</h1>
            {appointments.isSuccess && (
              <p className="today-count">
                {active.length === 0
                  ? 'No cleanings today'
                  : `${active.length} ${active.length === 1 ? 'Cleaning' : 'Cleanings'} Today`}
                {done > 0 && <span className="today-done"> · {done} done</span>}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-huge today-add" onClick={() => addCleaning({ date: today })}>
            <Icon name="plus" size={26} />
            Add Cleaning
          </button>
        </div>
      </header>

      {settings && settings.businessName === DEFAULT_BUSINESS_NAME && (
        <div className="notice">
          <p>
            <strong>Welcome to Veronica!</strong> Add your business name and phone in Settings so your text messages sound
            right.
          </p>
          <Link to="/settings" className="btn btn-secondary">
            Open Settings
          </Link>
        </div>
      )}

      {appointments.isPending && <Loading />}
      {appointments.isError && <ErrorState error={appointments.error} onRetry={() => appointments.refetch()} />}

      {appointments.isSuccess && (
        <div className="today-grid">
          <section className="today-next" aria-labelledby="next-heading">
            <h2 id="next-heading" className="section-label">
              Next Cleaning
            </h2>
            {next ? (
              <NextCleaningCard appointment={next} />
            ) : (
              <div className="card next-card next-card-empty">
                <p className="next-empty-title">
                  {active.length > 0 ? 'All done for today. Nice work!' : 'No cleanings today. Your schedule is clear.'}
                </p>
                {upcoming.data?.appointment && (
                  <p className="next-empty-upcoming">
                    Coming up:{' '}
                    <Link to={`/appointments/${upcoming.data.appointment.id}`}>
                      {upcoming.data.appointment.client.name} · {formatDateFriendly(upcoming.data.appointment.date)} at{' '}
                      {formatTime(upcoming.data.appointment.time)}
                    </Link>
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="today-schedule" aria-labelledby="schedule-heading">
            <h2 id="schedule-heading" className="section-label">
              Today's Schedule
            </h2>
            <AppointmentList
              appointments={list}
              highlightId={next?.id ?? null}
              emptyMessage="No cleanings today. Your schedule is clear."
            />
          </section>

          <UnpaidSection />
        </div>
      )}
    </div>
  );
}

function NextCleaningCard({ appointment }: { appointment: Appointment }) {
  const toast = useToast();
  const complete = useChange((id: number) => api.setStatus(id, 'completed'));
  const undo = useChange((id: number) => api.setStatus(id, 'scheduled', true));

  const markComplete = () =>
    complete.mutate(appointment.id, {
      onSuccess: () =>
        toast.success(`${appointment.client.name}'s cleaning is marked complete.`, {
          label: 'Undo',
          onClick: () => undo.mutate(appointment.id),
        }),
      onError: (error) => toast.error(errorMessage(error)),
    });

  return (
    <article className="card next-card" aria-label={`Next cleaning: ${appointment.client.name}`}>
      <Link to={`/appointments/${appointment.id}`} className="next-name">
        {appointment.client.name}
      </Link>
      <p className="next-time">
        <Icon name="clock" /> {formatTimeRange(appointment.time, appointment.durationMinutes)}
      </p>
      {appointment.client.address && (
        <p className="next-address">
          <Icon name="map" /> {appointment.client.address}
        </p>
      )}
      {appointment.notes && (
        <p className="next-notes">
          <Icon name="note" /> {appointment.notes}
        </p>
      )}
      <ContactActions
        clientId={appointment.client.id}
        clientName={appointment.client.name}
        phone={appointment.client.phone}
        address={appointment.client.address}
        appointment={appointment}
      />
      <button type="button" className="btn btn-success btn-huge btn-block" onClick={markComplete} disabled={complete.isPending}>
        <Icon name="check" size={26} />
        {complete.isPending ? 'Saving…' : 'Complete'}
      </button>
      <Link to={`/appointments/${appointment.id}`} className="next-details-link">
        See all details
        <Icon name="forward" size={18} />
      </Link>
    </article>
  );
}

/** Finished cleanings that have a price but haven't been paid yet. */
function UnpaidSection() {
  const unpaid = useUnpaid();
  if (!unpaid.data?.length) return null;
  const total = unpaid.data.reduce((sum, a) => sum + (a.priceCents ?? 0), 0);
  return (
    <section className="today-unpaid" aria-labelledby="unpaid-heading">
      <h2 id="unpaid-heading" className="section-label">
        Not Paid Yet <span className="section-label-note">{formatPrice(total)} total</span>
      </h2>
      <ul className="simple-list">
        {unpaid.data.slice(0, 8).map((a) => (
          <li key={a.id}>
            <Link to={`/appointments/${a.id}`} className="simple-row">
              <span className="simple-row-main">{a.client.name}</span>
              <span className="simple-row-detail">
                {formatDateShort(a.date)} · {formatPrice(a.priceCents)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {unpaid.data.length > 8 && <p className="muted">And {unpaid.data.length - 8} more.</p>}
    </section>
  );
}
