import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { ClientFormDialog } from '../components/ClientForm';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useChange, useClients } from '../hooks';

export function ClientsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());
  const clients = useClients(deferredSearch);
  const removed = useClients('', true);
  const restore = useChange(api.restoreClient);

  return (
    <div className="page page-clients">
      <header className="page-header">
        <h1 className="page-title">Clients</h1>
        <button type="button" className="btn btn-primary btn-large" onClick={() => setAdding(true)}>
          <Icon name="plus" />
          Add Client
        </button>
      </header>

      <div className="search">
        <label htmlFor="client-search" className="visually-hidden">
          Search clients
        </label>
        <Icon name="search" />
        <input
          id="client-search"
          type="search"
          className="input input-large"
          placeholder="Search clients…"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <p className="muted search-help">Search by name, phone number or address.</p>

      {clients.isPending && <Loading />}
      {clients.isError && <ErrorState error={clients.error} onRetry={() => clients.refetch()} />}
      {clients.isSuccess &&
        (clients.data.length === 0 ? (
          deferredSearch ? (
            <EmptyState title={`No clients match “${deferredSearch}”.`}>
              <p>Check the spelling, or try part of a phone number or street name.</p>
            </EmptyState>
          ) : (
            <EmptyState title="No clients yet.">
              <p>Add your first client, or just add a cleaning and the client is created for you.</p>
              <button type="button" className="btn btn-primary btn-large" onClick={() => setAdding(true)}>
                Add Your First Client
              </button>
            </EmptyState>
          )
        ) : (
          <ul className="client-list">
            {clients.data.map((client) => (
              <li key={client.id}>
                <Link to={`/clients/${client.id}`} className="client-row">
                  <span className="client-row-name">{client.name}</span>
                  <span className="client-row-details">
                    {client.phone && (
                      <span>
                        <Icon name="phone" size={18} /> {client.phone}
                      </span>
                    )}
                    {client.address && (
                      <span>
                        <Icon name="map" size={18} /> {client.address}
                      </span>
                    )}
                    {!client.phone && !client.address && <span className="muted">No phone or address yet</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {!!removed.data?.length && (
        <section className="removed-clients">
          <button
            type="button"
            className="btn btn-quiet"
            aria-expanded={showRemoved}
            onClick={() => setShowRemoved((value) => !value)}
          >
            {showRemoved ? 'Hide removed clients' : `Show removed clients (${removed.data.length})`}
          </button>
          {showRemoved && (
            <ul className="simple-list">
              {removed.data.map((client) => (
                <li key={client.id} className="simple-row">
                  <Link to={`/clients/${client.id}`} className="simple-row-main">
                    {client.name}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(client.id, {
                        onSuccess: (c) => toast.success(`${c.name} is back in your client list.`),
                        onError: (error) => toast.error(errorMessage(error)),
                      })
                    }
                  >
                    Bring Back
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {adding && <ClientFormDialog onClose={() => setAdding(false)} onSaved={(client) => navigate(`/clients/${client.id}`)} />}
    </div>
  );
}
