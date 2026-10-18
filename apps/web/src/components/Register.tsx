import { useEffect, useState, type FormEvent } from 'react';
import { checkInvite, register } from '../api';

/** Shown when the page is opened from an invite link: the invited person picks their own login. */
export function Register({ token, onRegistered, onCancel }: { token: string; onRegistered: () => void; onCancel: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkInvite(token).catch((err) => setInvalid(err instanceof Error ? err.message : String(err)));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(token, username, password);
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <div className="app auth">
        <div className="sign-in">
          <h1>Sports Better</h1>
          <p className="banner error">{invalid}</p>
          <button className="link" onClick={onCancel}>
            Already have an account? Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app auth">
      <form className="sign-in" onSubmit={submit}>
        <h1>Create your account</h1>
        <p className="muted small">Sports Better copies your Island Luck bets and tracks every pick against live stats.</p>
        <label>
          Username
          <input autoComplete="username" autoCapitalize="none" autoCorrect="off" minLength={2} maxLength={40} pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, . _ -" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password (at least 10 characters)
          <input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          Repeat password
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </label>
        {error && <p className="banner error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
