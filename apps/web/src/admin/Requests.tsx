import { useEffect, useState } from 'react';
import { answerAccessRequest, type AccessRequest } from '../api';
import { dateTime, relativeTime } from '../format';
import { LoadError } from '../components/LoadError';
import type { Fail } from './Admin';

type Done = { username: string; email: string | null; answer: 'approve' | 'decline'; emailed: boolean };

/** Requests to join, oldest first, each approved in one tap or declined in two. */
export function Requests({
  requests,
  error,
  onReload,
  onAnswered,
  fail,
}: {
  requests: AccessRequest[] | null;
  error: string | null;
  onReload: () => Promise<void>;
  onAnswered: (username: string) => void;
  fail: Fail;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  // Declining deletes the request, so it takes a second tap.
  const [armed, setArmed] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const answer = async (r: AccessRequest, a: 'approve' | 'decline') => {
    if (a === 'decline' && armed !== r.username) return setArmed(r.username);
    setArmed(null);
    setBusy(r.username);
    setActionError(null);
    try {
      const { emailed } = await answerAccessRequest(r.username, a);
      setDone({ username: r.username, email: r.email, answer: a, emailed });
      onAnswered(r.username);
    } catch (err) {
      const message = fail(err);
      if (message) {
        setActionError(message);
        // Someone else may have answered it already; the list shows where things stand.
        await onReload();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Requests to join</h2>
        {requests && requests.length > 0 && <span className="muted admin-tally">{requests.length} waiting</span>}
      </div>
      {done && (
        <p className="banner note" role="status">
          <span>
            {done.answer === 'approve' ? 'Approved' : 'Declined'} <b>{done.username}</b>.{' '}
            {done.emailed ? `We emailed them at ${done.email}.` : done.answer === 'approve' ? 'The email didn’t go out, so tell them they can sign in.' : 'The email didn’t go out, so tell them yourself.'}
          </span>
        </p>
      )}
      {actionError && <p className="banner error">{actionError}</p>}
      {error && !requests && <LoadError onRetry={() => void onReload()}>Can’t load requests right now.</LoadError>}
      {!requests && !error && <p className="muted">Loading…</p>}
      {requests?.length === 0 && <p className="admin-empty muted">No one is waiting. New requests from the sign-up page show up here.</p>}
      {requests && requests.length > 0 && (
        <ul className="admin-list">
          {requests.map((r) => (
            <li key={r.username} className="admin-row request">
              <div className="admin-who-col">
                <span className="admin-name">{r.username}</span>
                {r.email && (
                  <a className="admin-email" href={`mailto:${r.email}`}>
                    {r.email}
                  </a>
                )}
                {r.note ? <p className="request-note">{r.note}</p> : <p className="muted small request-no-note">No note</p>}
                <span className="muted small block">
                  {/* After a couple of days the relative time is already the date. */}
                  Asked {relativeTime(r.askedAt) === dateTime(r.askedAt) ? '' : `${relativeTime(r.askedAt)} · `}
                  <time dateTime={r.askedAt}>{dateTime(r.askedAt)}</time>
                </span>
              </div>
              <span className="actions">
                <button className="btn primary" disabled={busy !== null} onClick={() => void answer(r, 'approve')}>
                  {busy === r.username ? 'Saving…' : 'Approve'}
                </button>
                <button className={armed === r.username ? 'btn danger' : 'btn'} disabled={busy !== null} onClick={() => void answer(r, 'decline')}>
                  {armed === r.username ? 'Tap again to decline' : 'Decline'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
