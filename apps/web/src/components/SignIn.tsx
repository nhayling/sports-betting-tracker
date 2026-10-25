import { useState, type FormEvent } from 'react';
import { PendingApprovalError, signIn } from '../api';
import { FinePrint } from './Terms';
import { Wordmark } from './Wordmark';

export function SignIn({ onSignedIn, onJoin }: { onSignedIn: () => void; onJoin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // A request still waiting isn't a mistake, so it isn't shown as one.
  const [waiting, setWaiting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setWaiting(null);
    try {
      await signIn(username, password);
      setPassword('');
      onSignedIn();
    } catch (err) {
      if (err instanceof PendingApprovalError) setWaiting(err.message);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app auth">
      <form className="sign-in" onSubmit={submit}>
        <h1>
          <Wordmark />
        </h1>
        <label>
          Username or email
          <input autoComplete="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="banner error">{error}</p>}
        {waiting && <p className="banner note">{waiting}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" className="link" onClick={onJoin}>
          New here? Ask to join
        </button>
        <FinePrint />
      </form>
    </div>
  );
}
