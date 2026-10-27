import { useCallback, useEffect, useState } from 'react';
import { createInviteLink, fetchInvites, type InviteRow, type NewInvite } from '../api';
import { dateTime } from '../format';
import { LoadError } from '../components/LoadError';
import type { Fail } from './Admin';

const LENGTHS: [number, string][] = [
  [1, '1 day'],
  [7, '7 days'],
  [30, '30 days'],
];

function status(i: InviteRow): { label: string; tone: 'used' | 'open' | 'gone' } {
  if (i.usedAt) return { label: `Used by ${i.usedByUsername ?? 'someone'}`, tone: 'used' };
  if (Date.parse(i.expiresAt) <= Date.now()) return { label: 'Expired', tone: 'gone' };
  return { label: `Open until ${dateTime(i.expiresAt)}`, tone: 'open' };
}

/** Single-use links that skip approval: whoever opens one picks their own login. */
export function Invites({ fail }: { fail: Fail }) {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<NewInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    () =>
      fetchInvites().then(
        (r) => {
          setInvites(r.invites);
          setError(null);
        },
        (err) => setError(fail(err)),
      ),
    [fail],
  );
  useEffect(() => void load(), [load]);

  const make = async () => {
    setBusy(true);
    setCopied(false);
    try {
      setMade(await createInviteLink(days));
      await load();
    } catch (err) {
      setError(fail(err));
    } finally {
      setBusy(false);
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

  return (
    <section className="panel">
      <h2>Invite links</h2>
      <p className="admin-lede">A link works once. Whoever opens it first picks a username and password and can sign in straight away, with no approval.</p>
      <div className="invite-make">
        <div className="segmented" role="group" aria-label="Link lasts">
          {LENGTHS.map(([d, label]) => (
            <button key={d} className={days === d ? 'on' : undefined} aria-pressed={days === d} onClick={() => setDays(d)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn primary" disabled={busy} onClick={() => void make()}>
          {busy ? 'Making…' : 'Make a link'}
        </button>
      </div>
      {made && (
        <div className="invite-new" role="status">
          <span className="invite-url">{made.url}</span>
          <span className="invite-new-foot">
            <span className="muted small">Shown once. Works until {dateTime(made.expiresAt)}.</span>
            <button className="btn" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </span>
        </div>
      )}
      {error && <LoadError onRetry={() => void load()}>{invites ? error : 'Can’t load invite links right now.'}</LoadError>}

      <h3>Recent links</h3>
      {!invites && !error && <p className="muted">Loading…</p>}
      {invites?.length === 0 && <p className="muted small">No links made yet.</p>}
      {invites && invites.length > 0 && (
        <ul className="admin-list">
          {invites.map((i) => {
            const s = status(i);
            return (
              <li key={i.id} className="admin-row invite">
                <span>Made {dateTime(i.createdAt)}</span>
                <span className={`invite-status ${s.tone}`}>{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
