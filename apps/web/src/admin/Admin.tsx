import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fetchAccessRequests, fetchAdminMe, NotAdminError, PendingApprovalError, SignedOutError, signIn, signOut, type AccessRequest } from '../api';
import { LoadError } from '../components/LoadError';
import { Wordmark } from '../components/Wordmark';
import { Invites } from './Invites';
import { Members } from './Members';
import { Requests } from './Requests';

type Tab = 'requests' | 'members' | 'invites';
const TABS: [Tab, string][] = [
  ['requests', 'Requests'],
  ['members', 'Members'],
  ['invites', 'Invites'],
];
const tabFromHash = (): Tab => (TABS.some(([t]) => `#${t}` === location.hash) ? (location.hash.slice(1) as Tab) : 'requests');

type Phase = { kind: 'loading' } | { kind: 'signedOut' } | { kind: 'notAdmin'; message: string } | { kind: 'error'; message: string } | { kind: 'ready'; username: string };

/** The admin site: requests to join, members and invite links. Served on admin.<domain> only. */
export function Admin() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  // Kept here, so the Requests tab can show how many are waiting from any tab.
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const fail = useCallback((err: unknown) => {
    if (err instanceof SignedOutError) setPhase({ kind: 'signedOut' });
    else if (err instanceof NotAdminError) setPhase({ kind: 'notAdmin', message: err.message });
    else return err instanceof Error ? err.message : String(err);
    return null;
  }, []);

  const loadRequests = useCallback(
    () =>
      fetchAccessRequests().then(
        (r) => {
          setRequests(r.requests);
          setRequestsError(null);
        },
        (err) => setRequestsError(fail(err)),
      ),
    [fail],
  );

  const start = useCallback(async () => {
    try {
      const me = await fetchAdminMe();
      setPhase({ kind: 'ready', username: me.username });
      await loadRequests();
    } catch (err) {
      const message = fail(err);
      if (message) setPhase({ kind: 'error', message });
    }
  }, [fail, loadRequests]);
  useEffect(() => void start(), [start]);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const setTab = (t: Tab) => {
    history.replaceState(null, '', `#${t}`);
    setTabState(t);
  };

  const doSignOut = async () => {
    await signOut().catch(() => {});
    setRequests(null);
    setPhase({ kind: 'signedOut' });
  };

  if (phase.kind === 'loading') return <div className="app auth" aria-busy="true" />;
  if (phase.kind === 'signedOut') return <AdminSignIn onSignedIn={() => void start()} />;
  if (phase.kind === 'notAdmin')
    return (
      <div className="app auth">
        <div className="sign-in">
          <AdminTitle />
          <p className="banner note">{phase.message} Sign in with an admin account.</p>
          <button className="primary" onClick={() => void doSignOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  if (phase.kind === 'error')
    return (
      <div className="app auth">
        <div className="sign-in">
          <AdminTitle />
          <LoadError onRetry={() => void start()}>{phase.message}</LoadError>
        </div>
      </div>
    );

  const waiting = requests?.length ?? 0;
  return (
    <div className="app admin">
      <header className="shell">
        <div className="wrap">
          <div className="top">
            <AdminTitle />
            <div className="top-right">
              <span className="admin-who">{phase.username}</span>
              <button className="btn" onClick={() => void doSignOut()}>
                Sign out
              </button>
            </div>
          </div>
          <nav className="tabs admin-tabs" aria-label="Sections">
            {TABS.map(([t, label]) => (
              <button key={t} aria-current={tab === t ? 'page' : undefined} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
                {label}
                {t === 'requests' && waiting > 0 && (
                  <span className="count">
                    {waiting}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="wrap page admin-page">
        {tab === 'requests' && <Requests requests={requests} error={requestsError} onReload={loadRequests} onAnswered={(username) => setRequests((rs) => rs?.filter((r) => r.username !== username) ?? rs)} fail={fail} />}
        {tab === 'members' && <Members fail={fail} />}
        {tab === 'invites' && <Invites fail={fail} />}
      </main>
    </div>
  );
}

/** Turns a failed call into a message to show, or null when the session ended (the sign-in screen takes over). */
export type Fail = (err: unknown) => string | null;

function AdminTitle() {
  return (
    <h1 className="admin-title">
      <Wordmark />
      <span className="admin-mark">Admin</span>
    </h1>
  );
}

function AdminSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      setPassword('');
      onSignedIn();
    } catch (err) {
      // A request still waiting can't be an admin either.
      setError(err instanceof PendingApprovalError ? 'This account is still waiting for approval.' : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app auth">
      <form className="sign-in" onSubmit={submit}>
        <AdminTitle />
        <label>
          Username or email
          <input autoComplete="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="banner error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
