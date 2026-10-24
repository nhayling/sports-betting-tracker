import { useCallback, useEffect, useRef, useState } from 'react';
import { addTie, fetchPeople, removeTie, SignedOutError, type Person, type Relation, type Tie } from '../api';
import { Icon } from './Icon';
import { LoadError } from './LoadError';
import { nameOf } from './Leaderboard';

type Act = (action: 'add' | 'remove', tie: Tie, username: string) => void;

/** Friend first, then people you follow, then your followers, then everyone else. */
const closeness = (r: Relation) => (r.friend === 'FRIENDS' ? 0 : r.following !== 'NONE' ? 1 : r.followsYou === 'FOLLOWING' ? 2 : 3);

/** How you stand with someone, in one plain phrase: "Friend · you follow each other". */
export function relationPhrase(r: Relation): string {
  const both = r.following === 'FOLLOWING' && r.followsYou === 'FOLLOWING';
  const parts = [
    r.friend === 'FRIENDS' && 'friend',
    r.friend === 'SENT' && 'friend request sent',
    r.friend === 'RECEIVED' && 'wants to be friends',
    both && 'you follow each other',
    !both && r.following === 'FOLLOWING' && 'you follow them',
    r.following === 'REQUESTED' && 'follow requested',
    !both && r.followsYou === 'FOLLOWING' && 'follows you',
    r.followsYou === 'REQUESTED' && 'wants to follow you',
  ].filter((x): x is string => !!x);
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Step = { label: string; action: 'add' | 'remove'; tie: Tie; confirm?: string };

/**
 * Every change you can make to how you stand with one person, as one primary
 * step plus a More menu. Friends are always asked. Following is a request only
 * when their account is locked, and you remove followers only when yours is.
 * Ending a tie asks once more before it happens.
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
  const [confirming, setConfirming] = useState<string | null>(null);
  // An armed "Tap again" stands down after a few seconds, so a later stray tap can't end a tie.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(null), 4000);
    return () => clearTimeout(id);
  }, [confirming]);
  const follow: Step = { label: theirLocked ? 'Request to follow' : 'Follow', action: 'add', tie: 'follows' };
  const steps: Step[] = [
    r.friend === 'RECEIVED' && { label: 'Accept friend request', action: 'add', tie: 'friends' },
    r.followsYou === 'REQUESTED' && { label: 'Accept follower', action: 'add', tie: 'followers' },
    r.friend === 'NONE' && { label: 'Add friend', action: 'add', tie: 'friends' },
    r.following === 'NONE' && follow,
    r.friend === 'RECEIVED' && { label: 'Decline friend request', action: 'remove', tie: 'friends' },
    r.followsYou === 'REQUESTED' && { label: 'Decline follower', action: 'remove', tie: 'followers' },
    r.friend === 'SENT' && { label: 'Cancel friend request', action: 'remove', tie: 'friends' },
    r.following === 'REQUESTED' && { label: 'Cancel follow request', action: 'remove', tie: 'follows' },
    r.following === 'FOLLOWING' && { label: 'Unfollow', action: 'remove', tie: 'follows', confirm: 'Tap again to unfollow' },
    r.friend === 'FRIENDS' && { label: 'Unfriend', action: 'remove', tie: 'friends', confirm: 'Tap again to unfriend' },
    // On an open account they could just follow again, so removing is only offered on a locked one.
    r.followsYou === 'FOLLOWING' && youLocked && { label: 'Remove follower', action: 'remove', tie: 'followers', confirm: 'Tap again to remove' },
  ].filter((s): s is Step => !!s);
  // The first step that adds something leads; everything else waits in More.
  const primary = steps.find((s) => s.action === 'add') ?? null;
  const rest = steps.filter((s) => s !== primary);
  const run = (s: Step) => {
    if (s.confirm && confirming !== s.label) return setConfirming(s.label);
    setConfirming(null);
    onAct(s.action, s.tie);
  };

  return (
    <div className="actions">
      {primary && (
        <button className="btn primary" disabled={busy} onClick={() => run(primary)}>
          {primary.label}
        </button>
      )}
      {rest.length > 0 && (
        <details className="more" onToggle={(e) => !(e.currentTarget as HTMLDetailsElement).open && setConfirming(null)}>
          <summary className="btn">
            More <Icon name="chevron" />
          </summary>
          <div className="more-menu">
            <span className="sr-only" aria-live="polite">
              {rest.find((s) => s.label === confirming)?.confirm ?? ''}
            </span>
            {rest.map((s) => (
              <button key={s.label} className={s.confirm && confirming === s.label ? 'btn danger' : 'btn'} disabled={busy} onClick={() => run(s)}>
                {s.confirm && confirming === s.label ? s.confirm : s.label}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Waits this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 250;
/** Matches PEOPLE_SEARCH_LIMIT on the server: a full page means there may be more. */
const SEARCH_LIMIT = 20;

export function People({ onOpen, onChanged, onSignedOut }: { onOpen: (username: string) => void; onChanged: () => void; onSignedOut: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState('');
  // The results and the query they answer, so a slow reply to an older query is never shown.
  const [results, setResults] = useState<{ q: string; people: Person[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = query.trim();

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

  const latest = useRef('');
  const search = useCallback(
    (term: string) => fetchPeople(term).then((r) => setResults((cur) => (term === latest.current ? { q: term, people: r.people } : cur)), fail),
    [fail],
  );
  useEffect(() => {
    latest.current = q;
    if (!q) return setResults(null);
    const id = setTimeout(() => void search(q), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [q, search]);

  const act: Act = async (action, tie, username) => {
    setBusy(true);
    try {
      await (action === 'add' ? addTie : removeTie)(tie, username);
      await Promise.all([load(), q ? search(q) : null]);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (error && !people) return <LoadError onRetry={() => void load()}>Can’t load people right now.</LoadError>;
  if (!people) return <p className="muted center">Loading…</p>;
  return (
    <>
      {error && <LoadError onRetry={() => void load()}>That didn’t go through. Try again.</LoadError>}
      <PeopleList people={people} query={query} onQuery={setQuery} results={results?.q === q ? results.people : null} busy={busy} onOpen={onOpen} onAct={act} />
    </>
  );
}

/**
 * Requests waiting on you, then a search box over everyone on the tracker.
 * With nothing typed, the list is the people you already have a tie with.
 */
export function PeopleList({
  people,
  query,
  onQuery,
  results,
  busy,
  onOpen,
  onAct,
}: {
  people: Person[];
  query: string;
  onQuery: (q: string) => void;
  /** Null while a search is on its way. */
  results: Person[] | null;
  busy: boolean;
  onOpen: (username: string) => void;
  onAct: Act;
}) {
  const friendRequests = people.filter((p) => p.relation.friend === 'RECEIVED');
  // Only a locked account gets these; on an open one people just follow.
  const followRequests = people.filter((p) => p.relation.followsYou === 'REQUESTED');
  const searching = query.trim() !== '';
  const shown = searching ? results : people;
  const sorted = shown && [...shown].sort((a, b) => closeness(a.relation) - closeness(b.relation) || a.username.localeCompare(b.username));
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
                    Accept
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
        <label className="people-search">
          <Icon name="search" />
          <span className="sr-only">Find people</span>
          <input
            type="search"
            value={query}
            placeholder="Find people by name or @username"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={50}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        {!sorted ? (
          <p className="muted small" role="status">
            Searching…
          </p>
        ) : sorted.length === 0 ? (
          <p className="muted small" role="status">
            {searching
              ? `Nobody matches “${query.trim()}”. Check the spelling, or ask them for their username.`
              : 'Find someone you know above to add them as a friend or follow them. New people join with an invite link from whoever runs the tracker.'}
          </p>
        ) : (
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
                  {relationPhrase(p.relation) && <span className="relation">{relationPhrase(p.relation)}</span>}
                </span>
                {/* One step per row; following and everything else is on their profile. */}
                {p.relation.friend === 'NONE' && (
                  <span className="actions">
                    <button className="btn" disabled={busy} onClick={() => onAct('add', 'friends', p.username)}>
                      Add friend
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {searching && sorted && sorted.length === SEARCH_LIMIT && <p className="muted small">Showing the first {SEARCH_LIMIT}. Keep typing to narrow it down.</p>}
        <p className="muted small">Friends see each other’s picks; both of you agree. Following is one-way: you see their picks, and a locked account approves you first. Open someone’s profile to follow, unfollow or unfriend.</p>
      </section>
    </div>
  );
}
