import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Settings } from '../../shared/types';
import { addDays, formatDuration } from '../../shared/dates';
import {
  appointmentTemplateValues,
  DEFAULT_ON_MY_WAY_TEMPLATE,
  DEFAULT_REMINDER_TEMPLATE,
  fillTemplate,
} from '../../shared/templates';
import { checkName, checkPhone, checkTemplate } from '../../shared/validation';
import { api, ApiError, errorMessage } from '../api';
import { DURATION_CHOICES } from '../components/AppointmentForm';
import { Field, FormError } from '../components/Field';
import { Icon } from '../components/Icon';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useChange, useSettings, useToday } from '../hooks';

export function SettingsPage() {
  const settings = useSettings();
  return (
    <div className="page page-settings">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
      </header>
      {settings.isPending && <Loading />}
      {settings.isError && <ErrorState error={settings.error} onRetry={() => settings.refetch()} />}
      {settings.isSuccess && <SettingsForm key={settings.data.updatedAt} settings={settings.data} />}
      <BackupSection />
      <SignOutSection />
    </div>
  );
}

type Errors = Partial<Record<'businessName' | 'ownerName' | 'businessPhone' | 'reminderTemplate' | 'onMyWayTemplate', string>>;

function SettingsForm({ settings }: { settings: Settings }) {
  const toast = useToast();
  const today = useToday();
  const [values, setValues] = useState({
    businessName: settings.businessName,
    ownerName: settings.ownerName,
    businessPhone: settings.businessPhone ?? '',
    defaultDurationMinutes: settings.defaultDurationMinutes,
    reminderTemplate: settings.reminderTemplate,
    onMyWayTemplate: settings.onMyWayTemplate,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useChange(api.saveSettings);

  const set = <K extends keyof typeof values>(field: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const example = appointmentTemplateValues({
    clientName: 'Alex Sample',
    date: addDays(today, 1),
    time: '10:00',
    businessName: values.businessName,
  });

  const durations = DURATION_CHOICES.includes(values.defaultDurationMinutes)
    ? DURATION_CHOICES
    : [...DURATION_CHOICES, values.defaultDurationMinutes].sort((a, b) => a - b);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found: Errors = {};
    const name = checkName(values.businessName, 'business name');
    if (!name.ok) found.businessName = name.error;
    const phone = checkPhone(values.businessPhone);
    if (!phone.ok) found.businessPhone = phone.error;
    const reminder = checkTemplate(values.reminderTemplate, 'reminder message');
    if (!reminder.ok) found.reminderTemplate = reminder.error;
    const onMyWay = checkTemplate(values.onMyWayTemplate, '"On my way" message');
    if (!onMyWay.ok) found.onMyWayTemplate = onMyWay.error;
    setErrors(found);
    setFormError(null);
    const firstBad = Object.keys(found)[0];
    if (firstBad) {
      document.querySelector<HTMLElement>(`[data-field="settings-${firstBad}"]`)?.focus();
      return;
    }
    save.mutate(values, {
      onSuccess: () => toast.success('Settings saved.'),
      onError: (error) => {
        if (error instanceof ApiError && error.field) setErrors({ [error.field]: error.message });
        else setFormError(errorMessage(error));
      },
    });
  };

  return (
    <form className="form settings-form" onSubmit={onSubmit} noValidate>
      <section className="card settings-section" aria-labelledby="business-heading">
        <h2 id="business-heading" className="section-label">
          Business
        </h2>
        <p className="muted">
          If the business changes hands, update these. Clients, cleanings and payment history are never affected.
        </p>
        <Field label="Business name" error={errors.businessName}>
          {(props) => (
            <input
              {...props}
              data-field="settings-businessName"
              className="input"
              value={values.businessName}
              onChange={(event) => set('businessName', event.target.value)}
            />
          )}
        </Field>
        <Field label="Owner name" optional error={errors.ownerName}>
          {(props) => (
            <input
              {...props}
              data-field="settings-ownerName"
              className="input"
              value={values.ownerName}
              onChange={(event) => set('ownerName', event.target.value)}
            />
          )}
        </Field>
        <Field label="Business phone" optional error={errors.businessPhone}>
          {(props) => (
            <input
              {...props}
              data-field="settings-businessPhone"
              className="input"
              type="tel"
              inputMode="tel"
              value={values.businessPhone}
              onChange={(event) => set('businessPhone', event.target.value)}
            />
          )}
        </Field>
      </section>

      <section className="card settings-section" aria-labelledby="scheduling-heading">
        <h2 id="scheduling-heading" className="section-label">
          Scheduling
        </h2>
        <Field
          label="How long a cleaning usually takes"
          hint="New cleanings block out this much time, so Veronica can warn you about double bookings."
        >
          {(props) => (
            <select
              {...props}
              className="input"
              value={values.defaultDurationMinutes}
              onChange={(event) => set('defaultDurationMinutes', Number(event.target.value))}
            >
              {durations.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatDuration(minutes)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </section>

      <section className="card settings-section" aria-labelledby="messages-heading">
        <h2 id="messages-heading" className="section-label">
          Messages
        </h2>
        <p className="muted">
          These words are replaced automatically: <code>{'{client}'}</code> <code>{'{date}'}</code>{' '}
          <code>{'{time}'}</code> <code>{'{business}'}</code>
        </p>
        <Field label="Customer reminder" error={errors.reminderTemplate}>
          {(props) => (
            <textarea
              {...props}
              data-field="settings-reminderTemplate"
              className="input"
              rows={4}
              value={values.reminderTemplate}
              onChange={(event) => set('reminderTemplate', event.target.value)}
            />
          )}
        </Field>
        <p className="preview">
          <span className="preview-label">Example:</span> {fillTemplate(values.reminderTemplate, example)}
        </p>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => set('reminderTemplate', DEFAULT_REMINDER_TEMPLATE)}>
          Use the original wording
        </button>

        <Field label="On My Way" error={errors.onMyWayTemplate}>
          {(props) => (
            <textarea
              {...props}
              data-field="settings-onMyWayTemplate"
              className="input"
              rows={3}
              value={values.onMyWayTemplate}
              onChange={(event) => set('onMyWayTemplate', event.target.value)}
            />
          )}
        </Field>
        <p className="preview">
          <span className="preview-label">Example:</span> {fillTemplate(values.onMyWayTemplate, example)}
        </p>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => set('onMyWayTemplate', DEFAULT_ON_MY_WAY_TEMPLATE)}>
          Use the original wording
        </button>
      </section>

      <FormError message={formError} />
      <div className="settings-save">
        <button type="submit" className="btn btn-primary btn-huge" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}

function BackupSection() {
  return (
    <section className="card settings-section" aria-labelledby="backup-heading">
      <h2 id="backup-heading" className="section-label">
        Backup
      </h2>
      <p className="muted">Download a copy of all your clients, cleanings and settings. Keep it somewhere safe.</p>
      <a className="btn btn-secondary btn-large" href="/api/backup" download>
        <Icon name="download" />
        Download Backup
      </a>
    </section>
  );
}

function SignOutSection() {
  const session = useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: Infinity });
  if (!session.data?.authRequired) return null;
  const signOut = async () => {
    await api.logout().catch(() => undefined);
    window.location.href = '/';
  };
  return (
    <section className="card settings-section" aria-labelledby="signout-heading">
      <h2 id="signout-heading" className="section-label">
        This device
      </h2>
      <p className="muted">Sign out if this is a shared or borrowed computer.</p>
      <button type="button" className="btn btn-secondary btn-large" onClick={signOut}>
        Sign Out
      </button>
    </section>
  );
}
