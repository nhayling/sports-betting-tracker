import { useCallback, useEffect, useState } from 'react';
import { addTie, fetchPeople, removeTie, SignedOutError, type Person, type Relation, type Tie } from '../api';
import { Icon } from './Icon';
import { nameOf } from './Leaderboard';

type Act = (action: 'add' | 'remove', tie: Tie, username: string) => void;

/** Friend first, then people you follow, then your followers, then everyone else. */
const closeness = (r: Relation) => (r.friend === 'FRIENDS' ? 0 : r.following !== 'NONE' ? 1 : r.followsYou === 'FOLLOWING' ? 2 : 3);

export function relationChips(r: Relation): string[] {
  return [
    r.friend === 'FRIENDS' && 'Friend',
    r.friend === 'SENT' && 'Friend request sent',
    r.following === 'FOLLOWING' && 'Following',
    r.following === 'REQUESTED' && 'Follow requested',
    r.followsYou === 'FOLLOWING' && 'Follows you',
  ].filter((c): c is string => !!c);
}

/**
 * Every change you can make to how you stand with one person. Friends are
 * always asked. Following is a request only when their account is locked, and
 * you approve or remove followers only when yours is.
 */
export function RelationActions({
  relation: r,
  theirLocked,
  youLocked,
  busy,
  onAct,
}: {
  relation: Relation;
  theirLocked: boolean;
  youLocked: boolean;
  busy: boolean;
  onAct: (action: 'add' | 'remove', tie: Tie) => void;
}) {
  const button = (label: string, action: 'add' | 'remove', tie: Tie, primary = false) => (
    <button key={label} className={primary ? 'btn primary' : 'btn'} disabled={busy} onClick={() => onAct(action, tie)}>
      {label}
    </button>
  );
  return (
    <div className="actions">
      {r.friend === 'NONE' && button('Add friend', 'add', 'friends')}
      {r.friend === 'SENT' && button('Cancel friend request', 'remove', 'friends')}
      {r.friend === 'RECEIVED' && [button('Accept friend request', 'add', 'friends', true), button('Decline', 'remove', 'friends')]}
      {r.friend === 'FRIENDS' && button('Unfriend', 'remove', 'friends')}
      {r.following === 'NONE' && button(theirLocked ? 'Request to follow' : 'Follow', 'add', 'follows')}
      {r.following === 'REQUESTED' && button('Cancel follow request', 'remove', 'follows')}
      {r.following === 'FOLLOWING' && button('Unfollow', 'remove', 'follows')}
      {r.followsYou === 'REQUESTED' && [button('Approve follower', 'add', 'followers', true), button('Decline follower', 'remove', 'followers')]}
      {/* On an open account they could just follow again, so removing is only offered on a locked one. */}
      {r.followsYou === 'FOLLOWING' && youLocked && button('Remove follower', 'remove', 'followers')}
    </div>
  );
}

export function People({ onOpen, onChanged, onSignedOut }: { onOpen: (username: string) => void; onChanged: () => void; onSignedOut: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback((err: unknown) => (err instanceof SignedOutError ? onSignedOut() : setError(err instanceof Error ? err.message : String(err))), [onSignedOut]);
  const load = useCallback(
    () =>
      fetchPeople().then((r) => {
        setPeople(r.people);
        setError(null);
      }, fail),
    [fail],
  );
  useEffect(() => void load(), [load]);

  const act: Act = async (action, tie, username) => {
    setBusy(true);
    try {
      await (action === 'add' ? addTie : removeTie)(tie, username);
      await load();
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (error && !people) return <p className="banner error">{error}</p>;
  if (!people) return <p className="muted center">Loading…</p>;
  return (
    <>
      {error && <p className="banner error">{error}</p>}
      <PeopleList people={people} busy={busy} onOpen={onOpen} onAct={act} />
    </>
  );
}

export function PeopleList({ people, busy, onOpen, onAct }: { people: Person[]; busy: boolean; onOpen: (username: string) => void; onAct: Act }) {
  if (people.length === 0) {
    return <p className="muted center">Nobody else is on this tracker yet. New people join with an invite link from whoever runs it.</p>;
  }
  const friendRequests = people.filter((p) => p.relation.friend === 'RECEIVED');
  // Only a locked account gets these; on an open one people just follow.
  const followRequests = people.filter((p) => p.relation.followsYou === 'REQUESTED');
  const sorted = [...people].sort((a, b) => closeness(a.relation) - closeness(b.relation) || a.username.localeCompare(b.username));
  const name = (p: Person) => (
    <button className="name-link" onClick={() => onOpen(p.username)}>
      {nameOf(p)}
    </button>
  );

  return (
    <div className="analysis">
      {friendRequests.length + followRequests.length > 0 && (
        <section className="panel">
          <h2>Requests</h2>
          <ul className="people">
            {friendRequests.map((p) => (
              <li key={`friend-${p.username}`} className="person">
                <span>{name(p)} wants to be friends</span>
                <span className="actions">
                  <button className="btn primary" disabled={busy} onClick={() => onAct('add', 'friends', p.username)}>
                    Accept
                  </button>
                  <button className="btn" disabled={busy} onClick={() => onAct('remove', 'friends', p.username)}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
            {followRequests.map((p) => (
              <li key={`follow-${p.username}`} className="person">
                <span>{name(p)} wants to follow you</span>
                <span className="actions">
                  <button className="btn primary" disabled={busy} onClick={() => onAct('add', 'followers', p.username)}>
                    Approve
                  </button>
                  <button className="btn" disabled={busy} onClick={() => onAct('remove', 'followers', p.username)}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Friends and followers see your picks, odds and results. Sharing your real bet amounts is a separate choice for each, in Settings.</p>
        </section>
      )}

      <section className="panel">
        <h2>People</h2>
        <ul className="people">
          {sorted.map((p) => (
            <li key={p.username} className="person">
              <span className="person-name">
                {name(p)}
                {p.displayName && <span className="muted small"> @{p.username}</span>}
                {p.locked && (
                  <span className="chip">
                    <Icon name="lock" /> Locked
                  </span>
                )}
                {relationChips(p.relation).map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </span>
              <span className="actions">
                {p.relation.friend === 'NONE' && (
                  <button className="btn" disabled={busy} onClick={() => onAct('add', 'friends', p.username)}>
                    Add friend
                  </button>
                )}
                {p.relation.following === 'NONE' && (
                  <button className="btn" disabled={busy} onClick={() => onAct('add', 'follows', p.username)}>
                    {p.locked ? 'Request to follow' : 'Follow'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">Following shows you their picks. A locked account has to approve you first. Open someone’s profile to unfriend or unfollow.</p>
      </section>
    </div>
  );
}
