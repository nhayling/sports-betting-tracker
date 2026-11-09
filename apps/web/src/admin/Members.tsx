import { useCallback, useEffect, useState } from 'react';
import { fetchMembers, makePasswordResetLink, type Member, type NewPasswordReset } from '../api';
import { dateTime, relativeTime } from '../format';
import { LoadError } from '../components/LoadError';
import type { Fail } from './Admin';

const day = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Nassau', dateStyle: 'medium' }).format(new Date(iso));

/** Everyone approved, oldest first: who they are, whether they're using it, and a password reset link for anyone locked out. */
export function Members({ fail }: { fail: Fail }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Making a link emails them, so it takes a second tap.
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<(NewPasswordReset & { username: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const reset = async (username: string) => {
    if (armed !== username) return setArmed(username);
    setArmed(null);
    setBusy(username);
    setActionError(null);
    setCopied(false);
    try {
      setMade({ ...(await makePasswordResetLink(username)), username });
    } catch (err) {
      const message = fail(err);
      if (message) setActionError(message);
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.url);
      setCopied(true);
    } catch {
      // No clipboard access: the link is on screen to select by hand.
    }
  };

  const load = useCallback(
    () =>
      fetchMembers().then(
        (m) => {
          setMembers(m.members);
          setError(null);
        },
        (err) => setError(fail(err)),
      ),
    [fail],
  );
  useEffect(() => void load(), [load]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Members</h2>
        {members && <span className="muted admin-tally">{members.length}</span>}
      </div>
      {actionError && <p className="banner error" role="alert">{actionError}</p>}
      {error && <LoadError onRetry={() => void load()}>Can’t load members right now.</LoadError>}
      {!members && !error && <p className="muted">Loading…</p>}
      {members && (
        <ul className="admin-list">
          {members.map((m) => (
            <li key={m.username} className="admin-row member">
              <div className="admin-who-col">
                <span className="admin-name">
                  {m.displayName ?? m.username}
                  {m.admin && <span className="chip">Admin</span>}
                </span>
                <span className="muted small block">
                  {m.displayName && <>{m.username} · </>}
                  {m.email ?? 'No email'} · joined {day(m.joinedAt)}
                </span>
              </div>
              <div className="member-when small">
                <span className={m.lastSyncAt ? 'block' : 'block muted'}>{m.lastSyncAt ? `Synced ${relativeTime(m.lastSyncAt)}` : 'Never synced'}</span>
                <span className="block muted">{m.lastSeenAt ? `Seen ${relativeTime(m.lastSeenAt)}` : 'Not signed in'}</span>
                <button className="btn member-reset" disabled={busy !== null} onClick={() => void reset(m.username)}>
                  {busy === m.username ? 'Making…' : armed === m.username ? (m.email ? 'Tap again to email it' : 'Tap again for a link') : 'Reset password'}
                </button>
              </div>
              {made?.username === m.username && (
                <div className="invite-new member-reset-link" role="status">
                  <span className="small">
                    {made.emailed
                      ? `Emailed to ${made.email}. You can also send them this link:`
                      : made.email
                        ? `The email to ${made.email} didn’t go out, so send them this link yourself:`
                        : 'They have no email on file, so send them this link yourself:'}
                  </span>
                  <span className="invite-url">{made.url}</span>
                  <span className="invite-new-foot">
                    <span className="muted small">Shown once. Works until {dateTime(made.expiresAt)}, and any older link for them has stopped working.</span>
                    <button className="btn" onClick={() => void copy()}>
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
