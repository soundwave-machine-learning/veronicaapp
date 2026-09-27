import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Appointment } from '../../shared/types';
import { formatDateLong, formatDateFriendly, formatDuration, formatTimeRange, formatTime } from '../../shared/dates';
import { REPEAT_LABELS } from '../../shared/recurrence';
import { formatPrice } from '../../shared/validation';
import { api, ApiError, errorMessage } from '../api';
import { AppointmentFormDialog } from '../components/AppointmentForm';
import { PaymentBadge, StatusBadge } from '../components/Badges';
import { useConfirm } from '../components/Confirm';
import { ContactActions } from '../components/ContactActions';
import { Icon } from '../components/Icon';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useAppointment, useChange, useToday } from '../hooks';

/** Everything about one cleaning, with large buttons for every action. */
export function AppointmentPage() {
  const id = Number(useParams().id);
  const appointment = useAppointment(id);
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <div className="page page-appointment">
      <button type="button" className="back-link" onClick={goBack}>
        <Icon name="back" size={20} />
        Back
      </button>
      {appointment.isPending && <Loading />}
      {appointment.isError && <ErrorState error={appointment.error} onRetry={() => appointment.refetch()} />}
      {appointment.isSuccess && <AppointmentDetails appointment={appointment.data} />}
    </div>
  );
}

function AppointmentDetails({ appointment }: { appointment: Appointment }) {
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<'edit' | 'reschedule' | null>(null);

  const status = useChange((input: { status: Appointment['status']; allowConflict?: boolean }) =>
    api.setStatus(appointment.id, input.status, input.allowConflict),
  );
  const payment = useChange((value: Appointment['paymentStatus']) => api.setPayment(appointment.id, value));
  const stop = useChange(() => api.stopRepeating(appointment.id, today));

  const name = appointment.client.name;
  const busy = status.isPending || payment.isPending || stop.isPending;
  const isScheduled = appointment.status === 'scheduled';
  const isCompleted = appointment.status === 'completed';
  const isCanceled = appointment.status === 'canceled';
  const isPaid = appointment.paymentStatus === 'paid';
  const seriesActive = appointment.series && (!appointment.series.endsOn || appointment.series.endsOn > appointment.date);

  const changeStatus = (next: Appointment['status'], message: string, allowConflict = false) =>
    status.mutate(
      { status: next, allowConflict },
      {
        onSuccess: () => toast.success(message),
        onError: async (error) => {
          if (error instanceof ApiError && error.conflict) {
            const other = error.conflict.appointment;
            const ok = await confirm({
              title: 'This time is already booked',
              message: (
                <p>
                  You already have a cleaning scheduled around this time: <strong>{other.client.name}</strong>,{' '}
                  {formatDateFriendly(other.date)}, {formatTimeRange(other.time, other.durationMinutes)}.
                </p>
              ),
              confirmLabel: 'Bring It Back Anyway',
              cancelLabel: 'Keep It Canceled',
            });
            if (ok) changeStatus(next, message, true);
            return;
          }
          toast.error(errorMessage(error));
        },
      },
    );

  const onCancel = async () => {
    const ok = await confirm({
      title: 'Cancel this cleaning?',
      message: (
        <p>
          {name}'s cleaning on <strong>{formatDateFriendly(appointment.date)}</strong> at{' '}
          <strong>{formatTime(appointment.time)}</strong> will be marked <strong>Canceled</strong>. It stays in your
          records{appointment.series ? ' and the other repeat cleanings are not affected' : ''}.
        </p>
      ),
      confirmLabel: 'Yes, Cancel Cleaning',
      cancelLabel: 'Keep Cleaning',
      danger: true,
    });
    if (ok) changeStatus('canceled', `${name}'s cleaning was canceled.`);
  };

  const onStopRepeating = async () => {
    const ok = await confirm({
      title: 'Stop repeating?',
      message: (
        <p>
          {name}'s cleanings will stop repeating after <strong>{formatDateFriendly(appointment.date)}</strong>. Later
          repeat cleanings that are still just planned will be taken off the calendar. This cleaning, past cleanings and
          anything already completed or paid stay in your records.
        </p>
      ),
      confirmLabel: 'Yes, Stop Repeating',
      cancelLabel: 'Keep Repeating',
      danger: true,
    });
    if (!ok) return;
    stop.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(
          result.removed
            ? `Stopped repeating. ${result.removed} later ${result.removed === 1 ? 'cleaning was' : 'cleanings were'} taken off the calendar.`
            : 'Stopped repeating.',
        ),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <>
      <header className="appointment-header">
        <h1 className="page-title">{name}</h1>
        <p className="appointment-when">
          <span>{formatDateLong(appointment.date)}</span>
          <span>{formatTimeRange(appointment.time, appointment.durationMinutes)}</span>
        </p>
        <div className="badge-row">
          <StatusBadge status={appointment.status} />
          <PaymentBadge appointment={appointment} />
          {appointment.series && (
            <span className="badge badge-repeat">
              <Icon name="repeat" size={16} />
              {REPEAT_LABELS[appointment.series.frequency]}
            </span>
          )}
        </div>
      </header>

      <div className="appointment-grid">
        <div className="appointment-main">
          {!isCanceled && (
            <section className="card" aria-label="Contact">
              <ContactActions
                clientId={appointment.client.id}
                clientName={name}
                phone={appointment.client.phone}
                address={appointment.client.address}
                appointment={appointment}
                textLabel="Text Customer"
              />
            </section>
          )}

          <section className="card" aria-labelledby="details-heading">
            <h2 id="details-heading" className="section-label">
              Details
            </h2>
            <dl className="details">
              <div>
                <dt>Client</dt>
                <dd>
                  <Link to={`/clients/${appointment.client.id}`}>{name}</Link>
                </dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDateLong(appointment.date)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>
                  {formatTimeRange(appointment.time, appointment.durationMinutes)}{' '}
                  <span className="muted">({formatDuration(appointment.durationMinutes)})</span>
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{appointment.client.phone ?? <span className="muted">Not saved</span>}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{appointment.client.address ?? <span className="muted">Not saved</span>}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd className="pre-line">{appointment.notes ?? <span className="muted">No notes</span>}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{appointment.priceCents !== null ? formatPrice(appointment.priceCents) : <span className="muted">Not set</span>}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{isPaid ? 'Paid' : 'Unpaid'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{appointment.status === 'scheduled' ? 'Scheduled' : isCompleted ? 'Completed' : 'Canceled'}</dd>
              </div>
              <div>
                <dt>Repeats</dt>
                <dd>
                  {appointment.series
                    ? seriesActive
                      ? REPEAT_LABELS[appointment.series.frequency]
                      : `${REPEAT_LABELS[appointment.series.frequency]} (stopped)`
                    : "Doesn't repeat"}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="card appointment-actions" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="section-label">
            Actions
          </h2>
          <div className="action-stack">
            {isScheduled && (
              <button
                type="button"
                className="btn btn-success btn-huge"
                disabled={busy}
                onClick={() => changeStatus('completed', `${name}'s cleaning is marked complete.`)}
              >
                <Icon name="check" size={26} />
                Mark Complete
              </button>
            )}
            {isCompleted && (
              <button
                type="button"
                className="btn btn-secondary btn-large"
                disabled={busy}
                onClick={() => changeStatus('scheduled', 'Marked as not completed.')}
              >
                <Icon name="undo" />
                Mark Not Completed
              </button>
            )}
            <button
              type="button"
              className={`btn btn-large ${isPaid ? 'btn-secondary' : 'btn-money'}`}
              disabled={busy}
              onClick={() =>
                payment.mutate(isPaid ? 'unpaid' : 'paid', {
                  onSuccess: () => toast.success(isPaid ? 'Marked as unpaid.' : 'Marked as paid.'),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <Icon name="dollar" />
              {isPaid ? 'Mark Unpaid' : 'Mark Paid'}
            </button>
            {!isCanceled && (
              <>
                <button type="button" className="btn btn-secondary btn-large" onClick={() => setForm('reschedule')}>
                  <Icon name="calendar" />
                  Reschedule
                </button>
                <button type="button" className="btn btn-secondary btn-large" onClick={() => setForm('edit')}>
                  <Icon name="edit" />
                  Edit
                </button>
              </>
            )}
            {isScheduled && (
              <button type="button" className="btn btn-danger-quiet btn-large" disabled={busy} onClick={onCancel}>
                <Icon name="x" />
                Cancel Appointment
              </button>
            )}
            {isCanceled && (
              <button
                type="button"
                className="btn btn-secondary btn-large"
                disabled={busy}
                onClick={() => changeStatus('scheduled', `${name}'s cleaning is back on the schedule.`)}
              >
                <Icon name="undo" />
                Restore Appointment
              </button>
            )}
            {seriesActive && (
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={onStopRepeating}>
                <Icon name="repeat" />
                Stop Repeating After This
              </button>
            )}
          </div>
        </section>
      </div>

      {form && <AppointmentFormDialog appointment={appointment} mode={form} onClose={() => setForm(null)} />}
    </>
  );
}
