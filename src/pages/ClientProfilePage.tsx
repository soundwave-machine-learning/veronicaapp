import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { formatPrice } from '../../shared/validation';
import { api, errorMessage } from '../api';
import { AppointmentList } from '../components/AppointmentList';
import { ClientFormDialog } from '../components/ClientForm';
import { useConfirm } from '../components/Confirm';
import { ContactActions } from '../components/ContactActions';
import { Icon } from '../components/Icon';
import { useQuickAdd } from '../components/QuickAdd';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useChange, useClient, useToday } from '../hooks';

const UPCOMING_SHOWN = 5;
const PAST_SHOWN = 10;

export function ClientProfilePage() {
  const id = Number(useParams().id);
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const addCleaning = useQuickAdd();
  const [params, setParams] = useSearchParams();
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const client = useClient(id);
  const archive = useChange(() => api.archiveClient(id, today));
  const restore = useChange(() => api.restoreClient(id));

  const editing = params.get('edit') === '1';
  const setEditing = (value: boolean) => {
    const next = new URLSearchParams(params);
    if (value) next.set('edit', '1');
    else next.delete('edit');
    setParams(next, { replace: true });
  };

  if (client.isPending) return <Loading />;
  if (client.isError) return <ErrorState error={client.error} onRetry={() => client.refetch()} />;

  const data = client.data;
  const upcoming = data.appointments.filter((a) => a.status === 'scheduled' && a.date >= today);
  const past = data.appointments.filter((a) => !(a.status === 'scheduled' && a.date >= today)).reverse();
  const completed = past.filter((a) => a.status === 'completed');
  const unpaid = completed.filter((a) => a.paymentStatus === 'unpaid' && a.priceCents !== null);
  const unpaidTotal = unpaid.reduce((sum, a) => sum + (a.priceCents ?? 0), 0);

  const onRemove = async () => {
    const ok = await confirm({
      title: `Remove ${data.name}?`,
      message: (
        <>
          <p>{data.name} will be hidden from your client list.</p>
          <p>Their past cleanings and payments stay in your records. Upcoming cleanings for them will be taken off the calendar.</p>
          <p>You can bring {data.name} back later from the Clients page.</p>
        </>
      ),
      confirmLabel: `Yes, Remove ${data.name}`,
      danger: true,
    });
    if (!ok) return;
    archive.mutate(undefined, {
      onSuccess: () => toast.success(`${data.name} was removed. Their history is kept.`),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <div className="page page-client">
      <Link to="/clients" className="back-link">
        <Icon name="back" size={20} />
        All Clients
      </Link>

      <header className="page-header">
        <h1 className="page-title">{data.name}</h1>
      </header>

      {data.archivedAt && (
        <div className="notice notice-warning">
          <p>This client was removed. Their history is kept below.</p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={restore.isPending}
            onClick={() =>
              restore.mutate(undefined, {
                onSuccess: () => toast.success(`${data.name} is back in your client list.`),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            Bring Back
          </button>
        </div>
      )}

      <div className="profile-grid">
        <section className="card profile-card" aria-label="Client details">
          <dl className="details">
            <div>
              <dt>Phone</dt>
              <dd>{data.phone ?? <span className="muted">Not saved</span>}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{data.address ?? <span className="muted">Not saved</span>}</dd>
            </div>
            <div>
              <dt>Usual price</dt>
              <dd>{data.defaultPriceCents !== null ? formatPrice(data.defaultPriceCents) : <span className="muted">Not set</span>}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd className="pre-line">{data.notes ?? <span className="muted">No notes</span>}</dd>
            </div>
          </dl>

          <ContactActions
            clientId={data.id}
            clientName={data.name}
            phone={data.phone}
            address={data.address}
            appointment={upcoming[0] ?? null}
            actions={['call', 'text', 'directions']}
          />
          <div className="button-row">
            <button type="button" className="btn btn-secondary btn-large" onClick={() => setEditing(true)}>
              <Icon name="edit" />
              Edit Client
            </button>
            {!data.archivedAt && (
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={() => addCleaning({ client: { id: data.id, name: data.name } })}
              >
                <Icon name="plus" />
                Add Cleaning
              </button>
            )}
          </div>
        </section>

        <div className="profile-history">
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="section-label">
              Upcoming Cleanings
            </h2>
            <AppointmentList
              appointments={showAllUpcoming ? upcoming : upcoming.slice(0, UPCOMING_SHOWN)}
              showDate
              showClient={false}
              emptyMessage="No upcoming cleanings."
            />
            {upcoming.length > UPCOMING_SHOWN && (
              <button type="button" className="btn btn-quiet" onClick={() => setShowAllUpcoming((v) => !v)}>
                {showAllUpcoming ? 'Show fewer' : `Show all ${upcoming.length} upcoming cleanings`}
              </button>
            )}
          </section>

          <section aria-labelledby="past-heading">
            <h2 id="past-heading" className="section-label">
              Past Cleanings
            </h2>
            {past.length > 0 && (
              <p className="history-summary">
                {completed.length} completed
                {unpaid.length > 0 && (
                  <>
                    {' · '}
                    <strong className="text-unpaid">
                      {unpaid.length} not paid yet ({formatPrice(unpaidTotal)})
                    </strong>
                  </>
                )}
              </p>
            )}
            <AppointmentList
              appointments={showAllPast ? past : past.slice(0, PAST_SHOWN)}
              showDate
              showClient={false}
              emptyMessage="No past cleanings yet."
            />
            {past.length > PAST_SHOWN && (
              <button type="button" className="btn btn-quiet" onClick={() => setShowAllPast((v) => !v)}>
                {showAllPast ? 'Show fewer' : `Show all ${past.length} past cleanings`}
              </button>
            )}
          </section>
        </div>
      </div>

      {!data.archivedAt && (
        <div className="danger-zone">
          <button type="button" className="btn btn-danger-quiet" onClick={onRemove} disabled={archive.isPending}>
            Remove Client
          </button>
        </div>
      )}

      {editing && <ClientFormDialog client={data} onClose={() => setEditing(false)} />}
    </div>
  );
}
