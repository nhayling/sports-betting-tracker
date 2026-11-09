import { useState, type FormEvent } from 'react';
import { forgotPassword } from '../api';
import { AuthBrand } from './Wordmark';

/** "Forgot your password?" from the sign-in screen: emails a reset link. It never says whether an account exists. */
export function ForgotPassword({ login: initial, onBack }: { login: string; onBack: () => void }) {
  const [login, setLogin] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(login);
      setSentTo(login.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="app auth">
        <AuthBrand />
        <div className="sign-in">
          <h1>Check your email</h1>
          <p role="status">
            If <strong>{sentTo}</strong> has a Slip Club account with an email address, we’ve sent it a link to choose a new password. The link works once, for 24 hours.
          </p>
          <p className="muted small">
            Nothing after a few minutes? Check your spam folder. No email on your account? Write to <a href="mailto:slipclub@archipelagoapps.com">slipclub@archipelagoapps.com</a> and we’ll
            sort it out.
          </p>
          <button className="primary" onClick={onBack}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app auth">
      <AuthBrand />
      <form className="sign-in" onSubmit={submit}>
        <h1>Forgot password</h1>
        <p className="muted small">Enter your username or email and we’ll email you a link to choose a new password.</p>
        <label>
          Username or email
          <input autoComplete="username" autoCapitalize="none" autoCorrect="off" maxLength={254} value={login} onChange={(e) => setLogin(e.target.value)} required />
        </label>
        {error && <p className="banner error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Email me a link'}
        </button>
        <button type="button" className="link" onClick={onBack}>
          Back to sign in
        </button>
      </form>
    </div>
  );
}
