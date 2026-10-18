import { useCallback, useEffect, useState } from 'react';
import {
  fetchBets,
  fetchNotifications,
  fetchPollerStatus,
  fetchSocialMe,
  signOut,
  SignedOutError,
  type BetsView,
  type NotificationItem,
  type PollerStatus,
  type SocialMe,
} from './api';
import { betRank, betStanding, ORDER, type BetState } from './betState';
import { Account } from './components/Account';
import { Analysis } from './components/Analysis';
import { CouponCard } from './components/CouponCard';
import { FirstRun } from './components/FirstRun';
import { Icon } from './components/Icon';
import { LoadError } from './components/LoadError';
import { Notifications } from './components/Notifications';
import { Register } from './components/Register';
import { SignIn } from './components/SignIn';
import { Social } from './components/Social';
import { clockTime, money, relativeTime } from './format';

type Tab = 'open' | 'settled' | 'analysis' | 'social';
type BetsTab = 'open' | 'settled';
const TABS: Array<[Tab, string]> = [
  ['open', 'Open'],
  ['settled', 'Settled'],
  ['analysis', 'Analysis'],
  ['social', 'Social'],
];
/** The tally under the totals: each standing's name and the look of its count. */
const TALLY: Record<BetState, { label: string; tone: string }> = {
  'needs-one': { label: 'Needs one', tone: 'run' },
  risk: { label: 'At risk', tone: 'risk' },
  alive: { label: 'Running', tone: '' },
  'all-hit': { label: 'All hit', tone: 'hit' },
  unsynced: { label: 'Needs sync', tone: 'hollow' },
  waiting: { label: 'Not started', tone: 'hollow' },
  dead: { label: 'Dead', tone: 'miss' },
};
const REFRESH_MS = 15_000;
/** Three missed refreshes: what's on screen can no longer be called live. */
const STALE_MS = 3 * REFRESH_MS;

/** The Social tab keeps its own place after the slash (#social/people). */
function tabFromHash(): Tab {
  const name = location.hash.slice(1).split('/')[0];
  return name === 'settled' || name === 'analysis' || name === 'social' ? name : 'open';
}

export function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const setTab = (t: Tab) => {
    setTabState(t);
    setAccount(false);
    history.replaceState(null, '', t === 'open' ? location.pathname : `#${t}`);
  };
  // Each list is kept while the other tab is open, so coming back shows it at once and refreshes behind.
  const [views, setViews] = useState<Partial<Record<BetsTab, BetsView>>>({});
  /** undefined: not asked yet. null: the tracker didn't answer. */
  const [poller, setPoller] = useState<PollerStatus | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  // Opened from an invite link (/#invite=<token>): register instead of signing in.
  const [invite, setInvite] = useState(() => location.hash.match(/^#invite=([\w-]+)$/)?.[1] ?? null);
  const closeInvite = (nowSignedOut: boolean) => {
    history.replaceState(null, '', location.pathname);
    setSignedOut(nowSignedOut);
    setInvite(null);
  };
  const [notes, setNotes] = useState<{ unread: number; items: NotificationItem[] } | null>(null);
  const [social, setSocial] = useState<SocialMe | null>(null);
  const refreshSocial = useCallback(() => void fetchSocialMe().then(setSocial, () => {}), []);
  // Your own bets fill the Open and Settled tabs; the other tabs load their own data.
  const betsTab = tab === 'open' || tab === 'settled';
  const view: BetsTab = tab === 'settled' ? 'settled' : 'open';
  const [account, setAccount] = useState(false);
  const onSignedOut = useCallback(() => setSignedOut(true), []);
  const now = useNow(5_000);

  const load = useCallback(async () => {
    try {
      const [bets, status, feed, me] = await Promise.all([
        fetchBets(view),
        fetchPollerStatus().catch(() => null),
        fetchNotifications().catch(() => null),
        fetchSocialMe().catch(() => null),
      ]);
      setViews((v) => ({ ...v, [view]: bets }));
      setPoller(status);
      if (feed) setNotes(feed);
      if (me) setSocial(me);
      setUnreachable(false);
    } catch (err) {
      if (err instanceof SignedOutError) setSignedOut(true);
      else setUnreachable(true);
    }
  }, [view]);

  useEffect(() => {
    if (signedOut || invite) return;
    void load();
    // The server polls ESPN every ~30 s; refreshing the view every 15 s keeps it current.
    const id = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, signedOut, invite]);

  if (invite) return <Register token={invite} onRegistered={() => closeInvite(false)} onCancel={() => closeInvite(true)} />;
  if (signedOut) return <SignIn onSignedIn={() => setSignedOut(false)} />;

  const data = views[view] ?? null;
  const all = data?.coupons ?? [];
  // Open bets: closest to paying first, bets that can no longer win last. Settled bets keep the server's order.
  const coupons = tab === 'open' ? [...all].sort((a, b) => betRank(a) - betRank(b)) : all;
  const staked = all.reduce((n, c) => n + (c.stakeMinor ?? 0), 0);
  const returned = all.reduce((n, c) => n + (c.payoutMinor ?? 0), 0);
  // A bet with a final miss can't pay; one that is only at risk still can.
  const stillToPay = all.filter((c) => betStanding(c).state !== 'dead').reduce((n, c) => n + (c.potentialPayoutMinor ?? 0), 0);
  // How many open bets stand where, and the first bet of each, for the tally's jumps.
  const tally = ORDER.map((state) => ({ state, bets: tab === 'open' ? coupons.filter((c) => betStanding(c).state === state) : [] })).filter((t) => t.bets.length > 0);
  const firstRun = tab === 'open' && data !== null && all.length === 0 && data.lastSyncedAt === null;
  // The newest hit or miss on each bet, for its head line.
  const latest = new Map<string, NotificationItem>();
  for (const n of notes?.items ?? []) {
    if (n.couponId && n.kind !== 'PROBABLY_SETTLED' && !latest.has(n.couponId)) latest.set(n.couponId, n);
  }
  const doSignOut = async () => {
    await signOut().catch(() => {});
    setSignedOut(true);
  };

  return (
    <div className="app">
      <header className="shell">
        <div className="wrap">
          <div className="top">
            <h1>Sports Better</h1>
            <div className="top-right">
              {/* While the tracker can't be reached the banner says so; a live count would be a guess. */}
              {!unreachable && <LiveIndicator poller={poller} />}
              {notes && <Notifications feed={notes} onRead={() => setNotes({ ...notes, unread: 0 })} />}
              <button className="bell" aria-label="Account" aria-expanded={account} onClick={() => setAccount(!account)}>
                <Icon name="user" />
              </button>
            </div>
          </div>

          {/* How fresh everything is: this page, then the last sync from Island Luck. */}
          {views[view] && <Freshness data={views[view]} now={now} unreachable={unreachable} />}

          <nav className="tabs" aria-label="Sections">
            {TABS.map(([t, label]) => (
              <button key={t} aria-current={tab === t && !account ? 'page' : undefined} className={tab === t && !account ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
                {label}
                {t === 'social' && !!social?.pendingRequests && (
                  <span className="count">
                    {social.pendingRequests}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {betsTab && !account && data && !firstRun && (
          <section className="totals">
            <div className="wrap">
              {tab === 'open' ? (
                <>
                  <Stat label="Open bets" value={String(all.length)} />
                  <Stat label="At stake" value={money(staked)} />
                  <Stat label="Could still pay" value={money(stillToPay)} />
                </>
              ) : (
                <>
                  <Stat label="Settled bets" value={String(all.length)} />
                  <Stat label="Staked" value={money(staked)} />
                  <Stat label="Returned" value={money(returned)} />
                </>
              )}
            </div>
            {all.length > 1 && tally.length > 0 && (
              <nav className="wrap tally" aria-label="Open bets by standing">
                {tally.map(({ state, bets }) => (
                  <button key={state} className={TALLY[state].tone} onClick={() => document.getElementById(`bet-${bets[0]!.id}`)?.scrollIntoView({ block: 'start' })}>
                    <b>{bets.length}</b>
                    <span>{TALLY[state].label}</span>
                  </button>
                ))}
              </nav>
            )}
          </section>
        )}
      </header>

      <div className="wrap page">
        {unreachable && (
          <LoadError
            busy={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load();
              setRetrying(false);
            }}
          >
            {data ? `Can’t reach the tracker. Showing bets from ${clockTime(data.generatedAt)}.` : 'Can’t reach the tracker. Check your connection.'}
          </LoadError>
        )}

        {account ? (
          <Account username={social?.username ?? null} onClose={() => setAccount(false)} onSignOut={doSignOut} />
        ) : (
          <>
            {tab === 'analysis' && <Analysis onSignedOut={onSignedOut} />}
            {tab === 'social' && <Social me={social} onChanged={refreshSocial} onSignedOut={onSignedOut} />}

            {betsTab && !data && !unreachable && (
              <p className="muted center" role="status">
                Loading…
              </p>
            )}
            {firstRun && <FirstRun />}
            {betsTab && data && all.length === 0 && !firstRun && (
              <p className="muted center">
                {tab === 'open' ? (
                  <>
                    No open bets. New ones appear after you open My Bets on{' '}
                    <a href="https://islandluck.com/" target="_blank" rel="noreferrer">
                      Island Luck
                    </a>
                    .
                  </>
                ) : (
                  'No settled bets yet.'
                )}
              </p>
            )}

            {betsTab && coupons.length > 0 && (
              <main className="list">
                {/* Two stacks on a wide screen, dealt alternately so the order still reads top to bottom; one list on a phone. */}
                {[0, 1].map((col) => (
                  <div key={col} className="list-col">
                    {coupons.map((c, i) =>
                      i % 2 === col ? (
                        <div key={c.id} style={{ order: i }}>
                          <CouponCard coupon={c} latest={latest.get(c.id)} />
                        </div>
                      ) : null,
                    )}
                  </div>
                ))}
              </main>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Re-renders on a slow tick so "updated 20s ago" stays true between refreshes. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function Freshness({ data, now, unreachable }: { data: BetsView; now: number; unreachable: boolean }) {
  const age = Math.max(0, now - Date.parse(data.generatedAt));
  const stale = unreachable || age > STALE_MS;
  const updated = age < 10_000 ? 'just now' : age < 60_000 ? `${Math.floor(age / 5000) * 5}s ago` : relativeTime(data.generatedAt, now);
  const settled = data.coupons.filter((c) => c.probablySettled).length;
  // A day without a sync: new bets and results are missing.
  const oldSync = data.lastSyncedAt !== null && now - Date.parse(data.lastSyncedAt) > 24 * 3600_000;
  return (
    <p className="status">
      <span className={stale ? 'warn' : undefined}>{stale ? `Not updating · last updated ${updated}` : `Updated ${updated}`}</span>
      <span className={oldSync ? 'warn' : undefined}>{data.lastSyncedAt ? `Synced from Island Luck ${relativeTime(data.lastSyncedAt, now)}` : 'Not synced from Island Luck yet'}</span>
      {settled > 0 && (
        <span className="warn">
          {settled} bet{settled === 1 ? '' : 's'} probably settled
        </span>
      )}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function LiveIndicator({ poller }: { poller: PollerStatus | null | undefined }) {
  if (poller === undefined) return null;
  // No answer is not the same as off: say what is known.
  if (poller === null) return <span className="live-indicator">Live unknown</span>;
  if (!poller.running) return <span className="live-indicator off">Live stats off</span>;
  const live = poller.lastReport?.liveEvents ?? 0;
  if (poller.provider?.pausedUntil) return <span className="live-indicator off">Live stats paused</span>;
  if (!live) return <span className="live-indicator">No live games</span>;
  return (
    <span className="live-indicator on">
      <span className="live-dot" aria-hidden /> {live} live
    </span>
  );
}
