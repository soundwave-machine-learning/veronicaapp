import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { Client } from '../../shared/types';
import { searchClients } from '../../shared/clients';

interface ClientNameFieldProps {
  id: string;
  value: string;
  clients: Client[];
  invalid: boolean;
  describedBy?: string;
  onChange: (name: string, chosen: Client | null) => void;
}

/**
 * Type a name; matching clients appear underneath. Picking one links the
 * cleaning to that client. Accessible combobox: arrow keys move through the
 * suggestions, Enter picks one, Escape closes the list.
 */
export function ClientNameField({ id, value, clients, invalid, describedBy, onChange }: ClientNameFieldProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const suggestions = useMemo(() => (value.trim() ? searchClients(value, clients, 6) : []), [value, clients]);
  const showList = open && suggestions.length > 0;

  const choose = (client: Client) => {
    onChange(client.name, client);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && showList && active >= 0) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === 'Escape' && showList) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="combobox">
      <input
        id={id}
        data-field="clientName"
        type="text"
        className="input input-large"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        placeholder="Start typing a name"
        value={value}
        onChange={(event) => {
          onChange(event.target.value, null);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" className="combobox-list" hidden={!showList} aria-label="Matching clients">
        {suggestions.map((client, index) => (
          <li
            key={client.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={`combobox-option${index === active ? ' is-active' : ''}`}
            // Keep focus in the text box while clicking a suggestion.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(client)}
          >
            <span className="combobox-name">{client.name}</span>
            {(client.address || client.phone) && (
              <span className="combobox-detail">{[client.address, client.phone].filter(Boolean).join(' · ')}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
