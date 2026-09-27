import { useMemo, useState, type FormEvent } from 'react';
import type { Appointment, ConflictInfo } from '../../shared/types';
import { formatDuration, timeOptions, formatTime, formatDateFriendly } from '../../shared/dates';
import { REPEAT_LABELS } from '../../shared/recurrence';
import { checkDate, checkPrice, checkTime, priceInputValue } from '../../shared/validation';
import { api, ApiError, errorMessage } from '../api';
import { useChange, useToday } from '../hooks';
import { ConflictNotice } from './ConflictNotice';
import { useConfirm } from './Confirm';
import { Dialog } from './Dialog';
import { Field, FormError } from './Field';
import { useToast } from './Toast';

export const DURATION_CHOICES = [60, 90, 120, 150, 180, 210, 240, 300, 360, 480];

interface AppointmentFormProps {
  appointment: Appointment;
  mode: 'edit' | 'reschedule';
  onClose: () => void;
}

/** Edit or Reschedule one cleaning (or, for repeating cleanings, this and all later ones). */
export function AppointmentFormDialog({ appointment, mode, onClose }: AppointmentFormProps) {
  return (
    <Dialog
      open
      title={mode === 'edit' ? 'Edit Cleaning' : 'Reschedule Cleaning'}
      description={`${appointment.client.name} · ${formatDateFriendly(appointment.date)} at ${formatTime(appointment.time)}`}
      onClose={onClose}
    >
      <AppointmentForm appointment={appointment} mode={mode} onClose={onClose} />
    </Dialog>
  );
}

type Errors = Partial<Record<'date' | 'time' | 'price', string>>;

function AppointmentForm({ appointment, mode, onClose }: AppointmentFormProps) {
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.time);
  const [duration, setDuration] = useState(appointment.durationMinutes);
  const [price, setPrice] = useState(priceInputValue(appointment.priceCents));
  const [notes, setNotes] = useState(appointment.notes ?? '');
  const [scope, setScope] = useState<'one' | 'future'>('one');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const update = useChange((input: { allowConflict: boolean }) =>
    api.updateAppointment(appointment.id, {
      date,
      time,
      ...(mode === 'edit' ? { durationMinutes: duration, price, notes } : {}),
      scope,
      today,
      allowConflict: input.allowConflict,
    }),
  );

  const times = useMemo(() => {
    const list = timeOptions();
    return time && !list.includes(time) ? [...list, time].sort() : list;
  }, [time]);
  const durations = DURATION_CHOICES.includes(duration) ? DURATION_CHOICES : [...DURATION_CHOICES, duration].sort((a, b) => a - b);

  const focus = (field: string) =>
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-field="edit-${field}"]`)?.focus(), 0);

  const save = async (allowConflict: boolean) => {
    const found: Errors = {};
    const d = checkDate(date);
    if (!d.ok) found.date = d.error;
    const t = checkTime(time);
    if (!t.ok) found.time = t.error;
    if (mode === 'edit') {
      const p = checkPrice(price);
      if (!p.ok) found.price = p.error;
    }
    setErrors(found);
    setFormError(null);
    const firstBad = (['date', 'time', 'price'] as const).find((field) => found[field]);
    if (firstBad) return focus(firstBad);

    if (scope === 'future' && !allowConflict) {
      const ok = await confirm({
        title: 'Change all later cleanings?',
        message: (
          <p>
            This cleaning and every later repeat cleaning for <strong>{appointment.client.name}</strong> will move to{' '}
            <strong>
              {formatDateFriendly(date)} at {formatTime(time)}
            </strong>{' '}
            and keep repeating {REPEAT_LABELS[appointment.series!.frequency].toLowerCase()} from there. Past, completed
            and paid cleanings will not change.
          </p>
        ),
        confirmLabel: 'Yes, Change Them',
      });
      if (!ok) return;
    }

    update.mutate(
      { allowConflict },
      {
        onSuccess: (result) => {
          toast.success(
            mode === 'reschedule'
              ? `Moved to ${formatDateFriendly(result.date)} at ${formatTime(result.time)}.`
              : 'Changes saved.',
          );
          onClose();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.conflict) return setConflict(error.conflict);
          if (error instanceof ApiError && error.field && ['date', 'time', 'price'].includes(error.field)) {
            setErrors({ [error.field]: error.message });
            return focus(error.field);
          }
          setFormError(errorMessage(error));
        },
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!update.isPending) void save(false);
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="form-row">
        <Field label="Date" error={errors.date}>
          {(props) => (
            <input
              {...props}
              data-field="edit-date"
              type="date"
              className="input input-large"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setConflict(null);
              }}
            />
          )}
        </Field>
        <Field label="Time" error={errors.time}>
          {(props) => (
            <select
              {...props}
              data-field="edit-time"
              className="input input-large"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setConflict(null);
              }}
            >
              <option value="">Choose a time</option>
              {times.map((option) => (
                <option key={option} value={option}>
                  {formatTime(option)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {mode === 'edit' && (
        <>
          <div className="form-row">
            <Field label="How long">
              {(props) => (
                <select
                  {...props}
                  className="input"
                  value={duration}
                  onChange={(event) => {
                    setDuration(Number(event.target.value));
                    setConflict(null);
                  }}
                >
                  {durations.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {formatDuration(minutes)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Price" optional error={errors.price}>
              {(props) => (
                <div className="input-money">
                  <span aria-hidden="true">$</span>
                  <input
                    {...props}
                    data-field="edit-price"
                    className="input"
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
              )}
            </Field>
          </div>
          <Field label="Notes" optional>
            {(props) => (
              <textarea {...props} className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            )}
          </Field>
        </>
      )}

      {appointment.series && (
        <fieldset className="choice-group">
          <legend className="field-label">This cleaning repeats. Which cleanings should change?</legend>
          <div className="choices choices-stacked">
            <label className={`choice${scope === 'one' ? ' is-on' : ''}`}>
              <input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} />
              Only this cleaning
            </label>
            <label className={`choice${scope === 'future' ? ' is-on' : ''}`}>
              <input type="radio" name="scope" checked={scope === 'future'} onChange={() => setScope('future')} />
              This and all later cleanings
            </label>
          </div>
        </fieldset>
      )}

      {conflict && (
        <ConflictNotice
          conflict={conflict}
          busy={update.isPending}
          onChangeTime={() => {
            setConflict(null);
            focus('time');
          }}
          onBookAnyway={() => void save(true)}
        />
      )}
      <FormError message={formError} />

      {!conflict && (
        <div className="button-row">
          <button type="submit" className="btn btn-primary btn-large" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Move Cleaning'}
          </button>
          <button type="button" className="btn btn-secondary btn-large" onClick={onClose}>
            Go Back
          </button>
        </div>
      )}
    </form>
  );
}
