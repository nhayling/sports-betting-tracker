import { useEffect, useState, type FormEvent } from 'react';
import { checkPasswordReset, resetPassword } from '../api';
import { AuthBrand } from './Wordmark';

/** Shown when the page is opened from a password reset link: the member chooses a new password and is signed in. */
export function ResetPassword({ token, onReset, onCancel }: { token: string; onReset: () => void; onCancel: () => void }) {
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkPasswordReset(token).then(
      (r) => setUsername(r.username),
      (err) => setInvalid(err instanceof Error ? err.message : String(err)),
    );
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
      await resetPassword(token, password);
      onReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <div className="app auth">
        <AuthBrand />
        <div className="sign-in">
          <h1>Link not working</h1>
          <p className="banner error" role="alert">{invalid}</p>
          <button className="link" onClick={onCancel}>
            Sign in instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app auth">
      <AuthBrand />
      <form className="sign-in" onSubmit={submit}>
        <h1>New password</h1>
        <p className="muted small">
          {username ? (
            <>
              For <strong>{username}</strong>. You’ll be signed out in every other browser. The extension and phone sync stay connected.
            </>
          ) : (
            'Checking the link…'
          )}
        </p>
        {/* Lets password managers save the new password against the right account. */}
        <input type="text" autoComplete="username" value={username ?? ''} readOnly hidden />
        <label>
          New password (at least 10 characters)
          <input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          Repeat password
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </label>
        {error && <p className="banner error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !username}>
          {busy ? 'Saving…' : 'Save and sign in'}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          Remembered it? Sign in
        </button>
      </form>
    </div>
  );
}
