import { useCallback, useEffect, useState } from 'react';
import { addTie, fetchProfile, fetchProfileBets, removeTie, SignedOutError, type BetsView, type Period, type ProfileView, type Tie, type UnitStats } from '../api';
import { americanOdds, money, units } from '../format';
import { CouponCard } from './CouponCard';
import { Icon } from './Icon';
import { nameOf, PeriodPicker, roiPct, unitsClass } from './Leaderboard';
import { RelationActions, relationPhrase } from './People';

/** A friend's open bets move with the games, so keep them fresh while you watch. */
const REFRESH_MS = 30_000;
/** "2 followers", kept together when the line wraps. */
const count = (n: number, one: string, many = `${one}s`) => `${n}\u00a0${n === 1 ? one : many}`;

/** Someone's profile: who they are to you, their record in units, and their bets if they've let you in. */
export function Profile({
  username,
  youLocked,
  onBack,
  onSettings,
  onChanged,
  onSignedOut,
}: {
  username: string;
  /** Your own account is locked, so you can remove followers. */
  youLocked: boolean;
  onBack?: () => void;
  onSettings: () => void;
  onChanged: () => void;
  onSignedOut: () => void;
}) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<Period>('all');
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

  // Your own bets live in the Open and Settled tabs.
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

  return (
    <div className="analysis">
      {onBack && (
        <button className="link back" onClick={onBack}>
          <Icon name="back" />
          Back
        </button>
      )}
      {error && <p className="banner error">{error}</p>}
      {!profile && !error && <p className="muted center">Loading…</p>}
      {profile && <ProfileCard profile={profile} youLocked={youLocked} period={period} onPeriod={setPeriod} busy={busy} onAct={act} onSettings={onSettings} />}
      {profile && !profile.isYou && !profile.canSeeBets && (
        <p className="muted center">
          {profile.locked
            ? `This account is locked. Only ${nameOf(profile)}’s friends and approved followers can see their bets.`
            : `Follow ${nameOf(profile)} or become friends to see their bets.`}
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

export function ProfileCard({
  profile: p,
  youLocked,
  period,
  onPeriod,
  busy,
  onAct,
  onSettings,
}: {
  profile: ProfileView;
  youLocked: boolean;
  period: Period;
  onPeriod: (p: Period) => void;
  busy: boolean;
  onAct: (action: 'add' | 'remove', tie: Tie) => void;
  onSettings: () => void;
}) {
  const joined = new Date(p.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'America/Nassau' });
  const phrase = relationPhrase(p.relation);
  return (
    <section className="panel profile">
      <div className="panel-head">
        <h2 className="profile-name">
          {nameOf(p)}
          {p.locked && (
            <span className="chip">
              <Icon name="lock" /> Locked
            </span>
          )}
        </h2>
        {p.isYou && (
          <button className="link" onClick={onSettings}>
            Settings
          </button>
        )}
      </div>
      <p className="muted small">
        @{p.username} · Joined {joined} · {count(p.counts.friends, 'friend')} · {count(p.counts.followers, 'follower')} · {count(p.counts.following, 'following', 'following')}
      </p>

      {p.isYou ? (
        <p className="muted small">
          {p.locked
            ? 'This is your profile. Your account is locked: only friends and followers you approve can see your picks, odds and results.'
            : 'This is your profile. Your account is open: your friends, and anyone who follows you, can see your picks, odds and results.'}{' '}
          They see your real amounts only where you’ve switched them on.
        </p>
      ) : (
        <>
          {phrase && <p className="relation">{phrase}</p>}
          <RelationActions relation={p.relation} theirLocked={p.locked} youLocked={youLocked} busy={busy} onAct={onAct} />
        </>
      )}

      {p.stats ? (
        <>
          <div className="panel-head record-head">
            <h3>Record</h3>
            <PeriodPicker value={period} onChange={onPeriod} />
          </div>
          <Record stats={p.stats[period]} />
        </>
      ) : (
        <p className="muted small">{nameOf(p)} keeps their record private.</p>
      )}
    </section>
  );
}

function Record({ stats: s }: { stats: UnitStats }) {
  if (s.bets === 0) return <p className="muted small">No settled bets in this period.</p>;
  return (
    <div className="summary four">
      <div className="stat">
        <span className={`stat-value ${unitsClass(s.units)}`}>{units(s.units)}</span>
        <span className="stat-label">Units · 1 bet = 1 unit</span>
      </div>
      <div className="stat">
        <span className="stat-value">
          {s.won}–{s.lost}
        </span>
        <span className="stat-label">Won–lost{s.other > 0 && ` · ${s.other} cashed out`}</span>
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
