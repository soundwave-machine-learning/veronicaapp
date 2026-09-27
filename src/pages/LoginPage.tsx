import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { Field } from '../components/Field';

export function LoginPage() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.login(password);
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="card login-card form" onSubmit={onSubmit} noValidate>
        <p className="brand brand-large">VERONICA</p>
        <h1 className="login-title">Welcome back</h1>
        <p className="muted">Enter your password to open your appointment book.</p>
        <Field label="Password" error={error}>
          {(props) => (
            <input
              {...props}
              className="input input-large"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
          Show password
        </label>
        <button type="submit" className="btn btn-primary btn-huge btn-block" disabled={busy}>
          {busy ? 'Opening…' : 'Open Veronica'}
        </button>
      </form>
    </main>
  );
}
