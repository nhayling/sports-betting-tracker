import { useState, type FormEvent } from 'react';
import { askToJoin } from '../api';
import { ClubInviteNote } from './ClubInviteNote';
import { AgeCheck, FinePrint } from './Terms';

/**
 * Asking to join (/#join). During the beta an account waits for approval, so
 * this ends on "request sent" rather than signing in.
 */
export function SignUp({ onSignIn }: { onSignIn: () => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await askToJoin(username, email, password, note);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="app auth">
        <div className="sign-in">
          <h1>Request sent</h1>
          <p>
            Slip Club is in a small beta, so each new account is approved by hand. Once yours is, sign in with <strong>{username.trim().toLowerCase()}</strong> or{' '}
            <strong>{email.trim().toLowerCase()}</strong> and the password you just chose.
          </p>
          <p className="muted small">There’s no email to wait for yet. If you know who runs the tracker, a nudge speeds it up.</p>
          <ClubInviteNote>Your club invite is saved on this device. Once you’re approved, sign in here and you’ll go straight to the club.</ClubInviteNote>
          <button className="primary" onClick={onSignIn}>
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app auth">
      <form className="sign-in" onSubmit={submit}>
        <h1>Ask to join</h1>
        <ClubInviteNote>You’ve been invited to a club. Ask to join first; once you’re approved and signed in on this device, you’ll go straight to it.</ClubInviteNote>
        <p className="muted small">Slip Club copies your Island Luck bets and tracks every pick against live stats. It’s a small beta: requests are approved by hand.</p>
        <label>
          Username
          <input autoComplete="username" autoCapitalize="none" autoCorrect="off" minLength={2} maxLength={40} pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, . _ -" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" autoComplete="email" autoCapitalize="none" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password (at least 10 characters)
          <input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          Repeat password
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </label>
        <label>
          Who are you? (optional)
          <textarea rows={2} maxLength={280} placeholder="How you know us, or who sent you" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <AgeCheck />
        {error && <p className="banner error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Ask to join'}
        </button>
        <button type="button" className="link" onClick={onSignIn}>
          Already have an account? Sign in
        </button>
        <FinePrint />
      </form>
    </div>
  );
}
