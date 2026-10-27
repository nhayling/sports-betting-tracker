import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  clubInviteUrl,
  createClub,
  deleteClub,
  fetchClub,
  fetchClubFeed,
  fetchClubInvite,
  joinClub,
  leaveClub,
  removeClubMember,
  renameClub,
  resetClubInvite,
  setClubSharing,
  SignedOutError,
  type ClubFeedItem,
  type ClubInvite,
  type ClubSummary,
  type ClubView,
  type Period,
  type StandingRow,
} from '../api';
import { forgetClubInvite } from '../clubInvite';
import { money, units } from '../format';
import { CouponCard } from './CouponCard';
import { Icon } from './Icon';
import { LoadError } from './LoadError';
import { nameOf, PeriodPicker, roiPct, unitsClass } from './Leaderboard';

/** The feed's open bets move with the games. */
const REFRESH_MS = 30_000;
const PERIOD_WORDS: Record<Period, string> = { week: 'this week', month: 'this month', all: 'all time' };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const failWith = (onSignedOut: () => void, set: (e: string) => void) => (err: unknown) =>
  err instanceof SignedOutError ? onSignedOut() : set(err instanceof Error ? err.message : String(err));

/** Your place in a club as a small plate: yellow (you, now) once you're placed, hollow before you rank. */
function RankPlate({ row, label }: { row: StandingRow; label?: string }) {
  const tone = row.rank === null ? 'hollow' : 'run';
  // Re-keyed by the rank, so a change wipes in like every plate.
  return (
    <span key={row.rank ?? 'none'} className={`plate small-plate ${tone}`} aria-label={label}>
      {row.rank === null ? 'Unranked' : ordinal(row.rank)}
    </span>
  );
}

/** A club on the hub: its leaders and you, for one period. */
export function ClubPlate({ club: c, period, onOpen }: { club: ClubSummary; period: Period; onOpen: () => void }) {
  const gap = c.rows.length > 3 && c.you.rank !== null && c.you.rank > 4;
  return (
    <section className="panel club-plate">
      <button className="club-plate-head" onClick={onOpen} aria-label={`${c.name}, ${c.memberCount} members. You’re ${c.you.rank === null ? 'unranked' : ordinal(c.you.rank)} ${PERIOD_WORDS[period]}. Open club`}>
        <span className="club-plate-name">
          {c.name}
          <span className="muted small"> · {c.memberCount === 1 ? 'just you' : `${c.memberCount} members`}</span>
        </span>
        <RankPlate row={c.you} />
        <Icon name="chevron" />
      </button>
      {c.memberCount === 1 ? (
        <p className="muted small club-plate-note">Nobody else yet. Open the club to share its invite link.</p>
      ) : (
        <ol className="standings">
          {c.rows.flatMap((r, i) => [
            gap && i === 3 && (
              <li key="gap" className="standing-gap" aria-hidden="true">
                {c.you.rank! - 4} more
              </li>
            ),
            <li key={r.username} className={r.isYou ? 'standing you' : 'standing'}>
              <span className="standing-rank">{r.rank ?? '–'}</span>
              <span className="standing-name">
                {nameOf(r)}
                {r.isYou && ' (you)'}
              </span>
              <span className={`standing-units ${unitsClass(r.units)}`}>{r.bets > 0 ? units(r.units) : '—'}</span>
            </li>,
          ])}
        </ol>
      )}
    </section>
  );
}

/** Starting a club: a name, then straight to its page and invite link. */
export function NewClub({ onCreated, onCancel, onSignedOut }: { onCreated: (id: string) => void; onCancel: () => void; onSignedOut: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated((await createClub(name)).id);
    } catch (err) {
      failWith(onSignedOut, setError)(err);
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <h2>New club</h2>
      <form className="name-form" onSubmit={submit}>
        <label htmlFor="club-name" className="muted small">
          Club name
        </label>
        <div className="name-row">
          <input id="club-name" value={name} maxLength={40} placeholder="Sunday League" autoComplete="off" autoFocus onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" disabled={busy || !name.trim()}>
            {busy ? 'Starting…' : 'Start'}
          </button>
        </div>
        <p className="muted small" role={error ? 'alert' : undefined}>
          {error ?? 'A league, a friend group, the group chat. Only people with its invite link can join.'}
        </p>
      </form>
      <button className="btn" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}

type ClubTab = 'board' | 'feed' | 'members';

/** One club: its board, its feed of members' bets, and its members and invite link. */
export function ClubPage({
  id,
  onBack,
  onOpenPerson,
  onSettings,
  onChanged,
  onSignedOut,
}: {
  id: string;
  onBack: () => void;
  onOpenPerson: (username: string) => void;
  onSettings: () => void;
  /** Membership changed (left or deleted), so the hub's list is stale. */
  onChanged: () => void;
  onSignedOut: () => void;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const [club, setClub] = useState<ClubView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ClubTab>('board');
  const fail = useCallback((err: unknown) => failWith(onSignedOut, setError)(err), [onSignedOut]);
  const load = useCallback(
    () =>
      fetchClub(id, period).then((c) => {
        setClub(c);
        setError(null);
      }, fail),
    [id, period, fail],
  );
  useEffect(() => void load(), [load]);
  // A new club has nobody to rank yet; the invite link is what matters.
  const alone = club?.members.length === 1;

  return (
    <div className="panels">
      <button className="link back" onClick={onBack}>
        <Icon name="back" />
        Hub
      </button>
      {error && !club && <LoadError onRetry={() => void load()}>{error}</LoadError>}
      {!club && !error && <p className="muted center">Loading…</p>}
      {club && (
        <>
          <section className="panel club-head">
            <div className="panel-head">
              <h2 className="club-name">{club.name}</h2>
              <InviteButton code={club.inviteCode} name={club.name} />
            </div>
            <p className="muted small">
              {club.members.length === 1 ? 'Just you so far' : `${club.members.length} members`} · invite only · since{' '}
              {new Date(club.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Nassau' })}
            </p>
            {error && <p className="banner error">{error}</p>}
          </section>
          {alone ? (
            <InvitePanel club={club} onReset={(inviteCode) => setClub({ ...club, inviteCode })} onSignedOut={onSignedOut} lede />
          ) : (
            <>
              <div className="segmented quiet club-tabs" role="group" aria-label="Club">
                {(['board', 'feed', 'members'] as const).map((t) => (
                  <button key={t} className={tab === t ? 'on' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>
                    {t === 'board' ? 'Board' : t === 'feed' ? 'Bets' : 'Members'}
                  </button>
                ))}
              </div>
              {tab === 'board' && <ClubBoard club={club} period={period} onPeriod={setPeriod} onOpen={onOpenPerson} />}
              {tab === 'feed' && <ClubFeed id={club.id} onOpen={onOpenPerson} onSettings={onSettings} onSignedOut={onSignedOut} />}
            </>
          )}
          {(tab === 'members' || alone) && (
            <ClubMembers club={club} onOpen={onOpenPerson} onReload={() => void load()} onGone={onChanged} onRenamed={(name) => setClub({ ...club, name })} onReset={(inviteCode) => setClub({ ...club, inviteCode })} onSignedOut={onSignedOut} showInvite={!alone} />
          )}
        </>
      )}
    </div>
  );
}

/** Shares the invite link where the phone can (the share sheet), copies it otherwise. */
function InviteButton({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const share = async () => {
    const url = clubInviteUrl(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${name} on Slip Club`, url });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      prompt('Copy this invite link', url);
    }
  };
  return (
    <button className="btn primary" onClick={() => void share()}>
      <span aria-live="polite">{copied ? 'Link copied' : 'Invite'}</span>
    </button>
  );
}

function InvitePanel({ club, onReset, onSignedOut, lede }: { club: ClubView; onReset: (code: string) => void; onSignedOut: () => void; lede?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const reset = async () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    setBusy(true);
    try {
      onReset((await resetClubInvite(club.id)).inviteCode);
    } catch (err) {
      failWith(onSignedOut, setError)(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel invite">
      <h2>{lede ? 'Invite your people' : 'Invite link'}</h2>
      {lede && <p className="lede">The board and the bets fill up once people join. Send this link to the group chat; anyone who opens it while signed in can join.</p>}
      <div className="invite-row">
        <input readOnly value={clubInviteUrl(club.inviteCode)} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        <InviteButton code={club.inviteCode} name={club.name} />
      </div>
      {error && <p className="banner error">{error}</p>}
      <p className="muted small">
        Anyone with this link can join.{' '}
        {club.role === 'OWNER' && (
          <button className={armed ? 'link danger-link' : 'link'} disabled={busy} onClick={() => void reset()}>
            {armed ? 'Tap again: the old link stops working' : 'Make a new link'}
          </button>
        )}
      </p>
    </section>
  );
}

function ClubBoard({ club, period, onPeriod, onOpen }: { club: ClubView; period: Period; onPeriod: (p: Period) => void; onOpen: (u: string) => void }) {
  const you = club.board.find((r) => r.isYou)!;
  const ranked = club.board.filter((r) => r.rank !== null).length;
  const more = Math.max(1, club.minBets - you.bets);
  return (
    <section className="panel">
      <div className="board-head">
        <p className="lede board-you">
          {you.rank !== null ? (
            <>
              You’re <strong>{ordinal(you.rank)}</strong> of {ranked} {PERIOD_WORDS[period]} · <strong className={unitsClass(you.units)}>{units(you.units)}</strong>
            </>
          ) : (
            `${more} more settled bet${more === 1 ? '' : 's'} to rank ${PERIOD_WORDS[period]}`
          )}
        </p>
        <PeriodPicker value={period} onChange={onPeriod} quiet />
      </div>
      <table className="table board club-board">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Name</th>
            <th className="num">Units</th>
            <th className="num">Record</th>
            <th className="num wide-only">ROI</th>
          </tr>
        </thead>
        <tbody>
          {club.board.map((r) => (
            <tr key={r.username} className={r.isYou ? 'you' : undefined}>
              <td className="num rank">{r.rank === null ? '–' : <span className="rank-box">{r.rank}</span>}</td>
              <td>
                <button className="name-link" onClick={() => onOpen(r.username)}>
                  {nameOf(r)}
                </button>
                {r.isYou && <span className="chip">You</span>}
                {r.rank === null && <span className="muted small block">{Math.max(1, club.minBets - r.bets)} more to rank</span>}
              </td>
              <td className={`num ${unitsClass(r.units)}`}>{r.bets > 0 ? <strong>{units(r.units)}</strong> : '—'}</td>
              <td className="num">
                {r.won}–{r.lost}
                {r.other > 0 && <span className="muted"> (+{r.other})</span>}
              </td>
              <td className="num wide-only">{roiPct(r.roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Ranked on units, where every bet is one unit whatever was staked, once someone has {club.minBets} settled bets {PERIOD_WORDS[period]}.
      </p>
    </section>
  );
}

function ClubFeed({ id, onOpen, onSettings, onSignedOut }: { id: string; onOpen: (u: string) => void; onSettings: () => void; onSignedOut: () => void }) {
  const [view, setView] = useState<'open' | 'settled'>('open');
  const [feed, setFeed] = useState<{ items: ClubFeedItem[]; hidden: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFeed(null);
    let stale = false;
    const refresh = () =>
      fetchClubFeed(id, view).then(
        (f) => {
          if (stale) return;
          setFeed(f);
          setError(null);
        },
        (err) => !stale && failWith(onSignedOut, setError)(err),
      );
    void refresh();
    const t = view === 'open' ? setInterval(() => document.visibilityState === 'visible' && void refresh(), REFRESH_MS) : undefined;
    return () => {
      stale = true;
      clearInterval(t);
    };
  }, [id, view, onSignedOut, attempt]);
  const minBet = feed?.items.find((i) => i.minBetMinor !== undefined)?.minBetMinor;

  return (
    <section>
      <div className="feed-head">
        <div className="segmented quiet" role="group" aria-label="Which bets">
          {(['open', 'settled'] as const).map((t) => (
            <button key={t} className={view === t ? 'on' : ''} aria-pressed={view === t} onClick={() => setView(t)}>
              {t === 'open' ? 'Open' : 'Settled'}
            </button>
          ))}
        </div>
      </div>
      {error && <LoadError onRetry={() => setAttempt((n) => n + 1)}>Can’t load the club’s bets right now.</LoadError>}
      {!feed && !error && <p className="muted center">Loading…</p>}
      {minBet !== undefined && (
        <p className="min-bet-note">
          Some bets show what they pay on the {money(minBet).replace(/\.00$/, '')} minimum: those members haven’t shared their real amounts with this club. Each member
          chooses that for themselves, club by club, under Members.
        </p>
      )}
      {feed && feed.items.length === 0 && <p className="muted center">{view === 'open' ? 'Nobody in the club has an open bet right now.' : 'No settled bets yet.'}</p>}
      <div className="list feed">
        {feed?.items.map((item) => (
          <div key={`${item.username}-${item.coupon.id}`} className="feed-item">
            <p className="feed-who">
              {item.isYou ? (
                <span className="feed-name">You</span>
              ) : (
                <button className="name-link feed-name" onClick={() => onOpen(item.username)}>
                  {nameOf(item)}
                </button>
              )}
            </p>
            <CouponCard coupon={item.coupon} minBetMinor={item.minBetMinor} />
          </div>
        ))}
      </div>
      {feed && feed.hidden > 0 && (
        <p className="muted small feed-hidden">
          {feed.hidden === 1 ? '1 member keeps their' : `${feed.hidden} members keep their`} picks out of clubs.{' '}
          <button className="link" onClick={onSettings}>
            Your club sharing
          </button>
        </p>
      )}
    </section>
  );
}

function ClubMembers({
  club,
  onOpen,
  onReload,
  onGone,
  onRenamed,
  onReset,
  onSignedOut,
  showInvite,
}: {
  club: ClubView;
  onOpen: (u: string) => void;
  onReload: () => void;
  onGone: () => void;
  onRenamed: (name: string) => void;
  onReset: (code: string) => void;
  onSignedOut: () => void;
  showInvite: boolean;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(club.name);
  useEffect(() => setName(club.name), [club.name]);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const owner = club.role === 'OWNER';
  const others = club.members.length - 1;

  /** Ending something asks once more: the first tap arms it. */
  const run = async (key: string, action: () => Promise<unknown>, after: () => void) => {
    if (armed !== key) return setArmed(key);
    setArmed(null);
    setBusy(true);
    setError(null);
    try {
      await action();
      after();
    } catch (err) {
      failWith(onSignedOut, setError)(err);
    } finally {
      setBusy(false);
    }
  };
  const rename = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onRenamed((await renameClub(club.id, name)).name);
    } catch (err) {
      failWith(onSignedOut, setError)(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <YourSharing club={club} onChanged={onReload} onSignedOut={onSignedOut} />
      {showInvite && <InvitePanel club={club} onReset={onReset} onSignedOut={onSignedOut} />}
      <section className="panel">
        <h2>Members</h2>
        {error && <p className="banner error">{error}</p>}
        <ul className="people">
          {club.members.map((m) => (
            <li key={m.username} className="person">
              <span className="person-name">
                {m.isYou ? <strong>{nameOf(m)} (you)</strong> : (
                  <button className="name-link" onClick={() => onOpen(m.username)}>
                    {nameOf(m)}
                  </button>
                )}
                {m.role === 'OWNER' && <span className="chip">Owner</span>}
                <span className="relation">
                  Joined {new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Nassau' })}
                  {!m.sharesPicks ? ' · keeps picks out of clubs' : m.sharesAmounts ? ' · shares real amounts here' : ''}
                </span>
              </span>
              {owner && !m.isYou && (
                <button className={armed === m.username ? 'btn danger' : 'btn'} disabled={busy} onClick={() => void run(m.username, () => removeClubMember(club.id, m.username), onReload)}>
                  {armed === m.username ? 'Tap again to remove' : 'Remove'}
                </button>
              )}
            </li>
          ))}
        </ul>
        <span className="sr-only" aria-live="polite">
          {armed ? 'Tap again to confirm' : ''}
        </span>
      </section>
      <section className="panel">
        <h2>{owner ? 'Club settings' : 'Leave'}</h2>
        {owner && (
          <form className="name-form" onSubmit={rename}>
            <label htmlFor="club-rename" className="muted small">
              Club name
            </label>
            <div className="name-row">
              <input id="club-rename" value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} />
              <button className="btn primary" disabled={busy || !name.trim() || name.trim() === club.name}>
                Rename
              </button>
            </div>
          </form>
        )}
        <p className="muted small">
          {owner && others > 0
            ? 'If you leave, the member who joined first after you takes over the club.'
            : owner
              ? 'You’re the only member: leaving deletes the club.'
              : 'You can rejoin later with an invite link.'}
        </p>
        <div className="actions">
          <button className={armed === 'leave' ? 'btn danger' : 'btn'} disabled={busy} onClick={() => void run('leave', () => leaveClub(club.id), onGone)}>
            {armed === 'leave' ? 'Tap again to leave' : 'Leave club'}
          </button>
          {owner && others > 0 && (
            <button className={armed === 'delete' ? 'btn danger' : 'btn'} disabled={busy} onClick={() => void run('delete', () => deleteClub(club.id), onGone)}>
              {armed === 'delete' ? `Tap again: removes it for all ${others + 1}` : 'Delete club'}
            </button>
          )}
        </div>
      </section>
    </>
  );
}

/**
 * Your real amounts in this one club: off until you switch it on, so sharing
 * money with a group is always something you chose for that group.
 */
function YourSharing({ club, onChanged, onSignedOut }: { club: ClubView; onChanged: () => void; onSignedOut: () => void }) {
  const [on, setOn] = useState(club.youShareAmounts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setOn(club.youShareAmounts), [club.youShareAmounts]);
  const others = club.members.length - 1;
  const picksOff = !club.members.find((m) => m.isYou)?.sharesPicks;
  const flip = async (next: boolean) => {
    setOn(next);
    setSaving(true);
    setError(null);
    try {
      await setClubSharing(club.id, next);
      onChanged();
    } catch (err) {
      setOn(!next);
      failWith(onSignedOut, setError)(err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="panel">
      <h2>Your sharing here</h2>
      {error && <p className="banner error">{error}</p>}
      <label className="switch-row">
        <input type="checkbox" checked={on} disabled={saving || picksOff} onChange={(e) => void flip(e.target.checked)} />
        <span>
          Share my real amounts with {club.name}
          <span className="muted small block">
            {picksOff
              ? 'Your picks are kept out of clubs in Settings, so there’s nothing to share amounts on.'
              : on
                ? `The ${others === 1 ? 'other member sees' : `${others} other members see`} your real stakes, payouts and winnings here. Anyone who joins later will too.`
                : `Off: members see what your bets pay on the $5 minimum. Only this club changes; your other clubs keep their own setting.`}
          </span>
        </span>
      </label>
    </section>
  );
}

/** What an invite link opens: the club and what joining means, then Join. */
export function JoinClub({ code, onJoined, onCancel, onSignedOut }: { code: string; onJoined: (id: string) => void; onCancel: () => void; onSignedOut: () => void }) {
  const [invite, setInvite] = useState<ClubInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchClubInvite(code).then(
      (i) => {
        if (!i.isMember) return setInvite(i);
        forgetClubInvite();
        onJoined(i.id);
      },
      (err) => {
        // A dead link isn't worth bringing them back to; a signed-out one is.
        if (!(err instanceof SignedOutError)) forgetClubInvite();
        failWith(onSignedOut, setError)(err);
      },
    );
  }, [code, onJoined, onSignedOut]);
  const cancel = () => {
    forgetClubInvite();
    onCancel();
  };
  const join = async () => {
    setBusy(true);
    try {
      const { id } = await joinClub(code);
      forgetClubInvite();
      onJoined(id);
    } catch (err) {
      failWith(onSignedOut, setError)(err);
      setBusy(false);
    }
  };
  return (
    <div className="panels">
      {error && (
        <section className="panel">
          <h2>Invite link</h2>
          <p className="lede">{error}</p>
          <button className="btn" onClick={cancel}>
            Back to Social
          </button>
        </section>
      )}
      {!invite && !error && <p className="muted center">Loading…</p>}
      {invite && (
        <section className="panel join">
          <h2>Join {invite.name}?</h2>
          <p className="lede">
            {invite.memberCount === 1 ? '1 member' : `${invite.memberCount} members`}. A club has its own board and a feed of its members’ bets.
          </p>
          <ul className="join-terms">
            <li>Your record in units goes on the club’s board.</li>
            <li>Members see your picks, odds and results, at the $5 minimum. Turn that off any time in Settings.</li>
            <li>Your real amounts stay private here unless you switch them on for this club.</li>
          </ul>
          <div className="actions">
            <button className="btn primary" disabled={busy} onClick={() => void join()}>
              {busy ? 'Joining…' : 'Join club'}
            </button>
            <button className="btn" onClick={cancel}>
              Not now
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
