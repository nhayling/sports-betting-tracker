import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { addTie, fetchProfile, fetchProfileBets, removeTie, SignedOutError, type BetsView, type Period, type ProfileView, type SocialSettings, type Tie, type UnitStats } from '../api';
import { americanOdds, money, units } from '../format';
import { CouponCard } from './CouponCard';
import { Icon } from './Icon';
import { nameOf, PeriodPicker, roiPct, unitsClass } from './Leaderboard';
import { RelationActions, relationPhrase } from './People';

/** A friend's open bets move with the games, so keep them fresh while you watch. */
const REFRESH_MS = 30_000;
/** "2 followers", kept together when the line wraps. */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Someone else's profile: who they are to you, their record in units, and their bets if they've let you in. */
export function Profile({
  username,
  youLocked,
  onBack,
  backLabel = 'Back',
  onChanged,
  onSignedOut,
}: {
  username: string;
  /** Your own account is locked, so you can remove followers. */
  youLocked: boolean;
  onBack: () => void;
  backLabel?: string;
  onChanged: () => void;
  onSignedOut: () => void;
}) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [betsTab, setBetsTab] = useState<'open' | 'settled'>('open');
  const [bets, setBets] = useState<BetsView | null>(null);

  const fail = useCallback((err: unknown) => (err instanceof SignedOutError ? onSignedOut() : setError(err instanceof Error ? err.message : String(err))), [onSignedOut]);
  const load = useCallback(
    () =>
      fetchProfile(username).then((p) => {
        setProfile(p);
        setError(null);
      }, fail),
    [username, fail],
  );
  useEffect(() => {
    setProfile(null);
    void load();
  }, [load]);

  const showBets = !!profile && profile.canSeeBets && !profile.isYou;
  useEffect(() => {
    setBets(null);
    if (!showBets) return;
    let stale = false;
    const refresh = () => fetchProfileBets(username, betsTab).then((b) => !stale && setBets(b), fail);
    void refresh();
    const id = betsTab === 'open' ? setInterval(() => document.visibilityState === 'visible' && void refresh(), REFRESH_MS) : undefined;
    return () => {
      stale = true;
      clearInterval(id);
    };
  }, [username, betsTab, showBets, fail]);

  const act = async (action: 'add' | 'remove', tie: Tie) => {
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

  const phrase = profile && relationPhrase(profile.relation);
  return (
    <div className="panels">
      <button className="link back" onClick={onBack}>
        <Icon name="back" />
        {backLabel}
      </button>
      {error && <p className="banner error">{error}</p>}
      {!profile && !error && <p className="muted center">Loading…</p>}
      {profile && (
        <PlayerCard profile={profile}>
          {phrase && <p className="relation">{phrase}</p>}
          <RelationActions relation={profile.relation} theirLocked={profile.locked} youLocked={youLocked} busy={busy} onAct={act} />
        </PlayerCard>
      )}
      {profile && !profile.isYou && !profile.canSeeBets && (
        <p className="muted center">
          {profile.locked
            ? `This account is locked. Only ${nameOf(profile)}’s friends, approved followers and clubs can see their bets.`
            : `Follow ${nameOf(profile)}, become friends or share a club to see their bets.`}
        </p>
      )}
      {showBets && (
        <section>
          <div className="panel-head bets-head">
            <h2>Bets</h2>
            <div className="segmented" role="group" aria-label="Which bets">
              {(['open', 'settled'] as const).map((t) => (
                <button key={t} className={betsTab === t ? 'on' : ''} aria-pressed={betsTab === t} onClick={() => setBetsTab(t)}>
                  {t === 'open' ? 'Open' : 'Settled'}
                </button>
              ))}
            </div>
          </div>
          {bets?.minBetMinor !== undefined && (
            <p className="min-bet-note">
              {nameOf(profile)} doesn’t share bet amounts with you. Each bet shows what it pays on Island Luck’s {money(bets.minBetMinor).replace(/\.00$/, '')}{' '}
              minimum bet, not what {nameOf(profile)} staked.
            </p>
          )}
          {!bets && !error && <p className="muted center">Loading…</p>}
          {bets && bets.coupons.length === 0 && <p className="muted center">{betsTab === 'open' ? 'No open bets.' : 'No settled bets yet.'}</p>}
          <div className="list">{bets?.coupons.map((c) => <CouponCard key={c.id} coupon={c} minBetMinor={bets.minBetMinor} />)}</div>
        </section>
      )}
    </div>
  );
}

/**
 * A person as a lower-third: initial, name and counts, then their record in
 * units. `children` sits under the name (how you stand with them and what you
 * can do, or on your own card, who sees what); `aside` sits at the head's right.
 */
export function PlayerCard({ profile: p, aside, children }: { profile: ProfileView; aside?: ReactNode; children?: ReactNode }) {
  const [period, setPeriod] = useState<Period>('all');
  const joined = new Date(p.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Nassau' });
  return (
    <section className="panel player">
      <div className="player-head">
        <span className="player-initial" aria-hidden="true">
          {nameOf(p).charAt(0)}
        </span>
        <div className="player-who">
          <h2 className="profile-name">
            {nameOf(p)}
            {p.locked && (
              <span className="chip">
                <Icon name="lock" /> Locked
              </span>
            )}
          </h2>
          <p className="muted small player-meta">
            {[`@${p.username}`, `joined ${joined}`, count(p.counts.friends, 'friend'), count(p.counts.followers, 'follower'), count(p.counts.following, 'following', 'following')].map((part) => (
              <span key={part}>{part}</span>
            ))}
          </p>
        </div>
        {aside}
      </div>
      {children && <div className="player-body">{children}</div>}
      {p.stats ? (
        <div className="player-record">
          <div className="record-head">
            <h3>Record</h3>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          <Record stats={p.stats[period]} />
        </div>
      ) : (
        <p className="muted small player-body">{nameOf(p)} keeps their record private.</p>
      )}
    </section>
  );
}

function Record({ stats: s }: { stats: UnitStats }) {
  if (s.bets === 0) return <p className="muted small record-empty">No settled bets in this period.</p>;
  return (
    <div className="summary four record">
      <div className="stat">
        <span className={`stat-value ${unitsClass(s.units)}`}>{units(s.units)}</span>
        <span className="stat-label">Units</span>
      </div>
      <div className="stat">
        <span className="stat-value">
          {s.won}–{s.lost}
          {s.other > 0 && <span className="stat-extra" title={`${s.other} cashed out`}> +{s.other}</span>}
        </span>
        <span className="stat-label">Won–lost</span>
      </div>
      <div className="stat">
        <span className="stat-value">{roiPct(s.roi)}</span>
        <span className="stat-label">ROI</span>
      </div>
      <div className="stat">
        <span className="stat-value">{s.bestHitOddsRaw ? americanOdds(s.bestHitOddsRaw) : '—'}</span>
        <span className="stat-label">Best hit</span>
      </div>
    </div>
  );
}

/**
 * Who sees your picks and who sees your real amounts, as two rows of plates:
 * filled for an audience that sees it, hollow for one that doesn't. Replaces
 * the paragraph that used to say the same thing.
 */
export function WhoSees({ settings: s, clubAmounts, onSettings }: { settings: SocialSettings; /** Clubs you share real amounts with, of how many. */ clubAmounts?: { on: number; of: number }; onSettings: () => void }) {
  const followers = s.locked ? 'Approved followers' : 'Followers';
  const picks: Array<[string, boolean]> = [
    ['Friends', true],
    [followers, true],
    ['Clubs', s.sharePicksClubs],
  ];
  const amounts: Array<[string, boolean]> = [
    ['Friends', s.shareAmountsFriends],
    [followers, s.shareAmountsFollowers],
    ...(clubAmounts && clubAmounts.of > 0
      ? [[clubAmounts.on > 0 && clubAmounts.on < clubAmounts.of ? `${clubAmounts.on} of ${clubAmounts.of} clubs` : 'Clubs', s.sharePicksClubs && clubAmounts.on > 0] as [string, boolean]]
      : []),
    ['Leaderboard', s.shareAmountsLeaderboard],
  ];
  const row = (label: string, list: Array<[string, boolean]>) => (
    <div className="who-row">
      <span className="who-label">{label}</span>
      <ul className="who-plates">
        {list.map(([who, sees]) => (
          <li key={who} className={sees ? 'who on' : 'who'}>
            {who}
            <span className="sr-only">{sees ? ': yes' : ': no'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="who-sees">
      <div className="who-row">
        <span className="who-label">Account</span>
        <ul className="who-plates">
          <li className="who on">
            {s.locked && <Icon name="lock" />} {s.locked ? 'Locked' : 'Open'}
          </li>
          <li className="who-note">{s.locked ? 'you approve followers' : 'anyone can follow'}</li>
        </ul>
      </div>
      {row('Your picks', picks)}
      {row('Real amounts', amounts)}
      <p className="who-legend">
        <span className="who on" aria-hidden="true">
          Sees it
        </span>
        <span className="who" aria-hidden="true">
          $5 min
        </span>
        <span className="sr-only">Filled: they see it. Outlined: they don’t; amounts show at the $5 minimum.</span>
        <button className="link" onClick={onSettings}>
          Change
        </button>
      </p>
    </div>
  );
}
