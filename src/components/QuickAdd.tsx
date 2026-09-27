import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Client, ConflictInfo, NewAppointmentInput } from '../../shared/types';
import { addDays, formatDateFriendly, formatTime, timeOptions } from '../../shared/dates';
import { REPEAT_LABELS, REPEAT_OPTIONS, type Repeat } from '../../shared/recurrence';
import { nameKey } from '../../shared/clients';
import { checkDate, checkName, checkPhone, checkPrice, checkTime, priceInputValue } from '../../shared/validation';
import { api, ApiError, errorMessage, newRequestId } from '../api';
import { useChange, useClients, useToday } from '../hooks';
import { ConflictNotice } from './ConflictNotice';
import { Dialog } from './Dialog';
import { Field, FormError } from './Field';
import { ClientNameField } from './ClientNameField';
import { Icon } from './Icon';
import { useToast } from './Toast';

interface QuickAddOptions {
  date?: string;
  client?: Pick<Client, 'id' | 'name'>;
}

const QuickAddContext = createContext<((options?: QuickAddOptions) => void) | null>(null);

/** Open the Add Cleaning form from anywhere: `const addCleaning = useQuickAdd(); addCleaning({ date })`. */
export function useQuickAdd() {
  const context = useContext(QuickAddContext);
  if (!context) throw new Error('useQuickAdd must be used inside QuickAddProvider');
  return context;
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ key: number; options: QuickAddOptions } | null>(null);
  const open = useCallback((options: QuickAddOptions = {}) => {
    setSession({ key: Date.now(), options });
  }, []);
  const close = useCallback(() => setSession(null), []);

  return (
    <QuickAddContext.Provider value={open}>
      {children}
      <Dialog open={session !== null} title="Add Cleaning" onClose={close}>
        {session && <QuickAddForm key={session.key} options={session.options} onDone={close} />}
      </Dialog>
    </QuickAddContext.Provider>
  );
}

type Errors = Partial<Record<'clientName' | 'date' | 'time' | 'phone' | 'price' | 'address' | 'notes' | 'repeat', string>>;

const FIELD_ORDER: (keyof Errors)[] = ['clientName', 'date', 'time', 'address', 'phone', 'price', 'notes', 'repeat'];

function QuickAddForm({ options, onDone }: { options: QuickAddOptions; onDone: () => void }) {
  const today = useToday();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();

  const [clientName, setClientName] = useState(options.client?.name ?? '');
  const [chosen, setChosen] = useState<Pick<Client, 'id' | 'name'> | null>(options.client ?? null);
  const [date, setDate] = useState(options.date ?? today);
  const [time, setTime] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [requestId] = useState(newRequestId);

  const create = useChange(api.createAppointment);

  // The client this cleaning will belong to: the one picked from the list,
  // or an existing client whose name matches exactly what was typed.
  const linkedClient = useMemo(() => {
    const key = nameKey(clientName);
    if (!key) return null;
    if (chosen && nameKey(chosen.name) === key) return clients.find((c) => c.id === chosen.id) ?? null;
    return clients.find((c) => nameKey(c.name) === key) ?? null;
  }, [chosen, clientName, clients]);

  const onClientChange = (name: string, client: Client | null) => {
    setClientName(name);
    setChosen(client);
    setErrors((e) => ({ ...e, clientName: undefined }));
    if (client) {
      // Show what we already know; typing something different updates the client.
      if (!address && client.address) setAddress(client.address);
      if (!phone && client.phone) setPhone(client.phone);
      if (!price && client.defaultPriceCents !== null) setPrice(priceInputValue(client.defaultPriceCents));
    }
  };

  const times = useMemo(() => {
    const list = timeOptions();
    return time && !list.includes(time) ? [...list, time].sort() : list;
  }, [time]);

  const focusField = (field: keyof Errors) => {
    if (['address', 'phone', 'price', 'notes', 'repeat'].includes(field)) setMoreOpen(true);
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-field="${field}"]`)?.focus(), 0);
  };

  const submit = (allowConflict = false) => {
    const found: Errors = {};
    const nameCheck = checkName(clientName);
    if (!nameCheck.ok) found.clientName = nameCheck.error;
    const dateCheck = checkDate(date);
    if (!dateCheck.ok) found.date = dateCheck.error;
    const timeCheck = checkTime(time);
    if (!timeCheck.ok) found.time = timeCheck.error;
    const phoneCheck = checkPhone(phone);
    if (!phoneCheck.ok) found.phone = phoneCheck.error;
    const priceCheck = checkPrice(price);
    if (!priceCheck.ok) found.price = priceCheck.error;
    setErrors(found);
    setFormError(null);
    const firstBad = FIELD_ORDER.find((field) => found[field]);
    if (firstBad) {
      focusField(firstBad);
      return;
    }

    const input: NewAppointmentInput = {
      clientId: linkedClient?.id ?? null,
      clientName,
      date,
      time,
      address,
      phone,
      price,
      notes,
      repeat,
      requestId,
      allowConflict,
    };
    create.mutate(input, {
      onSuccess: (result) => {
        const repeatText = repeat === 'none' ? '' : ` Repeats ${REPEAT_LABELS[repeat].toLowerCase()}.`;
        toast.success(
          `Cleaning added for ${result.client.name} on ${formatDateFriendly(result.appointment.date)} at ${formatTime(result.appointment.time)}.${repeatText}`,
          { label: 'View', onClick: () => navigate(`/appointments/${result.appointment.id}`) },
        );
        onDone();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.conflict) {
          setConflict(error.conflict);
          return;
        }
        if (error instanceof ApiError && error.field && FIELD_ORDER.includes(error.field as keyof Errors)) {
          setErrors({ [error.field]: error.message });
          focusField(error.field as keyof Errors);
          return;
        }
        setFormError(errorMessage(error));
      },
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!create.isPending) submit(false);
  };

  return (
    <form className="form quick-add" onSubmit={onSubmit} noValidate>
      <Field label="Client" error={errors.clientName}>
        {(props) => (
          <>
            <ClientNameField
              id={props.id}
              value={clientName}
              clients={clients}
              invalid={props['aria-invalid']}
              describedBy={[props['aria-describedby'], 'client-link-hint'].filter(Boolean).join(' ')}
              onChange={onClientChange}
            />
            <p id="client-link-hint" className="field-hint" aria-live="polite">
              {linkedClient ? (
                <span className="client-link-hint is-existing">
                  <Icon name="user" size={18} /> Existing client
                  {linkedClient.address ? ` · ${linkedClient.address}` : ''}
                </span>
              ) : clientName.trim() ? (
                <span className="client-link-hint is-new">
                  <Icon name="plus" size={18} /> New client, or pick a name from the list.
                </span>
              ) : null}
            </p>
          </>
        )}
      </Field>

      <div className="form-row">
        <Field label="Date" error={errors.date}>
          {(props) => (
            <div>
              <input
                {...props}
                data-field="date"
                type="date"
                className="input input-large"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setConflict(null);
                  setErrors((e) => ({ ...e, date: undefined }));
                }}
              />
              <div className="chip-row">
                <button type="button" className={`chip${date === today ? ' is-on' : ''}`} onClick={() => setDate(today)}>
                  Today
                </button>
                <button
                  type="button"
                  className={`chip${date === addDays(today, 1) ? ' is-on' : ''}`}
                  onClick={() => setDate(addDays(today, 1))}
                >
                  Tomorrow
                </button>
              </div>
            </div>
          )}
        </Field>

        <Field label="Time" error={errors.time}>
          {(props) => (
            <select
              {...props}
              data-field="time"
              className="input input-large"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setConflict(null);
                setErrors((e) => ({ ...e, time: undefined }));
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

      <button
        type="button"
        className="more-toggle"
        aria-expanded={moreOpen}
        aria-controls="quick-add-more"
        onClick={() => setMoreOpen((value) => !value)}
      >
        <span aria-hidden="true" className="more-toggle-sign">
          {moreOpen ? '−' : '+'}
        </span>
        More options
        <span className="more-toggle-note">address, phone, price, notes, repeat</span>
      </button>

      <div id="quick-add-more" className="more-options" hidden={!moreOpen}>
        <Field label="Address" optional error={errors.address}>
          {(props) => (
            <input
              {...props}
              data-field="address"
              className="input"
              autoComplete="off"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          )}
        </Field>
        <div className="form-row">
          <Field label="Phone" optional error={errors.phone}>
            {(props) => (
              <input
                {...props}
                data-field="phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setErrors((e) => ({ ...e, phone: undefined }));
                }}
              />
            )}
          </Field>
          <Field label="Price" optional error={errors.price}>
            {(props) => (
              <div className="input-money">
                <span aria-hidden="true">$</span>
                <input
                  {...props}
                  data-field="price"
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={price}
                  onChange={(event) => {
                    setPrice(event.target.value);
                    setErrors((e) => ({ ...e, price: undefined }));
                  }}
                />
              </div>
            )}
          </Field>
        </div>
        <Field label="Notes" optional error={errors.notes}>
          {(props) => (
            <textarea
              {...props}
              data-field="notes"
              className="input"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          )}
        </Field>
        <fieldset className="choice-group">
          <legend className="field-label">Repeat</legend>
          <div className="choices">
            {REPEAT_OPTIONS.map((option) => (
              <label key={option} className={`choice${repeat === option ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="repeat"
                  value={option}
                  data-field={option === 'none' ? 'repeat' : undefined}
                  checked={repeat === option}
                  onChange={() => {
                    setRepeat(option);
                    setConflict(null);
                  }}
                />
                {REPEAT_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {conflict && (
        <ConflictNotice
          conflict={conflict}
          busy={create.isPending}
          onChangeTime={() => {
            setConflict(null);
            focusField('time');
          }}
          onBookAnyway={() => submit(true)}
        />
      )}
      <FormError message={formError} />

      {!conflict && (
        <button type="submit" className="btn btn-primary btn-huge btn-block" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add to Schedule'}
        </button>
      )}
    </form>
  );
}
