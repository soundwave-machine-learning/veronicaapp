import { useState, type FormEvent } from 'react';
import type { Client, ClientInput } from '../../shared/types';
import { checkName, checkPhone, checkPrice, priceInputValue } from '../../shared/validation';
import { api, ApiError, errorMessage } from '../api';
import { useChange } from '../hooks';
import { Dialog } from './Dialog';
import { Field, FormError } from './Field';
import { useToast } from './Toast';

interface ClientFormDialogProps {
  client?: Client;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}

type Errors = Partial<Record<keyof ClientInput, string>>;

/** Add a client or edit their details. Only the name is required. */
export function ClientFormDialog({ client, onClose, onSaved }: ClientFormDialogProps) {
  const toast = useToast();
  const [values, setValues] = useState<ClientInput>({
    name: client?.name ?? '',
    phone: client?.phone ?? '',
    address: client?.address ?? '',
    notes: client?.notes ?? '',
    defaultPrice: priceInputValue(client?.defaultPriceCents),
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useChange((input: ClientInput) => (client ? api.updateClient(client.id, input) : api.createClient(input)));

  const set = (field: keyof ClientInput) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const focus = (field: string) =>
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-field="client-${field}"]`)?.focus(), 0);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    const found: Errors = {};
    const n = checkName(values.name);
    if (!n.ok) found.name = n.error;
    const p = checkPhone(values.phone);
    if (!p.ok) found.phone = p.error;
    const d = checkPrice(values.defaultPrice);
    if (!d.ok) found.defaultPrice = d.error;
    setErrors(found);
    setFormError(null);
    const firstBad = (['name', 'phone', 'defaultPrice'] as const).find((field) => found[field]);
    if (firstBad) return focus(firstBad);

    save.mutate(values, {
      onSuccess: (saved) => {
        toast.success(client ? `Saved changes for ${saved.name}.` : `${saved.name} added to your clients.`);
        onSaved?.(saved);
        onClose();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.field && error.field in values) {
          setErrors({ [error.field]: error.message });
          return focus(error.field);
        }
        setFormError(errorMessage(error));
      },
    });
  };

  return (
    <Dialog open title={client ? 'Edit Client' : 'Add Client'} onClose={onClose}>
      <form className="form" onSubmit={onSubmit} noValidate>
        <Field label="Name" error={errors.name}>
          {(props) => (
            <input
              {...props}
              data-field="client-name"
              className="input input-large"
              autoComplete="off"
              autoCapitalize="words"
              value={values.name}
              onChange={(event) => set('name')(event.target.value)}
            />
          )}
        </Field>
        <Field label="Phone" optional error={errors.phone}>
          {(props) => (
            <input
              {...props}
              data-field="client-phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="(555) 123-4567"
              value={values.phone}
              onChange={(event) => set('phone')(event.target.value)}
            />
          )}
        </Field>
        <Field label="Address" optional error={errors.address}>
          {(props) => (
            <input
              {...props}
              data-field="client-address"
              className="input"
              autoComplete="off"
              value={values.address}
              onChange={(event) => set('address')(event.target.value)}
            />
          )}
        </Field>
        <Field label="Usual price" optional error={errors.defaultPrice} hint="Used for new cleanings for this client.">
          {(props) => (
            <div className="input-money">
              <span aria-hidden="true">$</span>
              <input
                {...props}
                data-field="client-defaultPrice"
                className="input"
                inputMode="decimal"
                autoComplete="off"
                value={values.defaultPrice}
                onChange={(event) => set('defaultPrice')(event.target.value)}
              />
            </div>
          )}
        </Field>
        <Field label="Notes" optional error={errors.notes} hint="Gate codes, pets, special requests…">
          {(props) => (
            <textarea
              {...props}
              data-field="client-notes"
              className="input"
              rows={4}
              value={values.notes}
              onChange={(event) => set('notes')(event.target.value)}
            />
          )}
        </Field>
        <FormError message={formError} />
        <div className="button-row">
          <button type="submit" className="btn btn-primary btn-large" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : client ? 'Save Client' : 'Add Client'}
          </button>
          <button type="button" className="btn btn-secondary btn-large" onClick={onClose}>
            Go Back
          </button>
        </div>
      </form>
    </Dialog>
  );
}
