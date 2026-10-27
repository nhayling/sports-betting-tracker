import { useCallback, useEffect, useState } from 'react';
import { fetchMembers, type Member } from '../api';
import { relativeTime } from '../format';
import { LoadError } from '../components/LoadError';
import type { Fail } from './Admin';

const day = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Nassau', dateStyle: 'medium' }).format(new Date(iso));

/** Everyone approved, oldest first: who they are and whether they're using it. */
export function Members({ fail }: { fail: Fail }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
