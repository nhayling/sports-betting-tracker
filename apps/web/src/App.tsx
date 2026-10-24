import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBets,
  fetchMe,
  fetchNotifications,
  fetchPollerStatus,
  fetchSocialMe,
  signOut,
  SignedOutError,
  type BetsView,
  type CouponView,
  type Me,
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
import { SignUp } from './components/SignUp';
import { Wordmark } from './components/Wordmark';
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
  unsynced: { label: 'Needs sync', tone: 'sync' },
  waiting: { label: 'Not started', tone: 'hollow' },
  dead: { label: 'Dead', tone: 'miss' },
};
const REFRESH_MS = 15_000;
/** When this device last left the app, so changes since then can be marked. */
const SEEN_KEY = 'sports-better:last-seen';
function readSeen(): number | null {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}
/** When this device last put off adding an email; asked again after a couple of weeks. */
const EMAIL_LATER_KEY = 'sports-better:email-later';
const EMAIL_LATER_MS = 14 * 24 * 60 * 60_000;
function emailPutOff(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(EMAIL_LATER_KEY)) < EMAIL_LATER_MS;
  } catch {
    return false;
  }
}
function putOffEmail() {
  try {
    localStorage.setItem(EMAIL_LATER_KEY, String(Date.now()));
  } catch {
    // Not remembered; asked again next visit.
  }
}

function writeSeen(at: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // Not remembered; nothing is marked new next time.
  }
}
/** Three missed refreshes: what's on screen can no longer be called live. */
const STALE_MS = 3 * REFRESH_MS;

/** The Social tab keeps its own place after the slash (#social/people). */
function tabFromHash(): Tab {
  const name = location.hash.slice(1).split('/')[0];
  return name === 'settled' || name === 'analysis' || name === 'social' ? name : 'open';
}

export function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  // The Open list keeps its order while you read; it re-sorts when you come back to it.
  const order = useRef<string[]>([]);
  const resortNext = useRef(true);
  // Changes newer than this are marked on their bet: the time this device last left the app.
  const [seenAt, setSeenAt] = useState(readSeen);
  // When this visit began. Only changes from the time away are marked; ones you watch happen are not "new since your last visit".
  const [visitAt, setVisitAt] = useState(Date.now);
  // Which desktop stack each bet sits in, held between re-sorts so no bet changes column mid-read.
  const column = useRef(new Map<string, number>());
  // A notification tapped: the bet to bring into view once its list is on screen.
  const [jump, setJump] = useState<string | null>(null);
  const setTab = (t: Tab) => {
    resortNext.current = true;
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
  // Asking to join (/#join), from the sign-in screen or a shared link.
  const [joining, setJoining] = useState(() => location.hash === '#join');
  const [me, setMe] = useState<Me | null>(null);
  const [emailLater, setEmailLater] = useState(emailPutOff);
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
  const clearJump = useCallback(() => setJump(null), []);
  useJump(jump, views[tab === 'settled' ? 'settled' : 'open']?.coupons, clearJump);
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
    if (signedOut || invite || joining) return;
    void fetchMe().then(setMe, () => {});
  }, [signedOut, invite, joining]);

  useEffect(() => {
    if (signedOut || invite || joining) return;
    void load();
    // The server polls ESPN every ~30 s; refreshing the view every 15 s keeps it current.
    const id = setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        resortNext.current = true;
        setSeenAt(readSeen());
        setVisitAt(Date.now());
        void load();
      } else writeSeen(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, signedOut, invite, joining]);

  if (invite) return <Register token={invite} onRegistered={() => closeInvite(false)} onCancel={() => closeInvite(true)} />;
  if (joining) {
    return (
      <SignUp
        onSignIn={() => {
          history.replaceState(null, '', location.pathname);
          setJoining(false);
          setSignedOut(true);
        }}
      />
    );
  }
  if (signedOut) {
    return (
      <SignIn
        onSignedIn={() => setSignedOut(false)}
        onJoin={() => {
          history.replaceState(null, '', '#join');
          setJoining(true);
        }}
      />
    );
  }

  /** Open bets by standing, but held in place between refreshes; new bets join at the top. */
  function heldOrder(list: CouponView[]): CouponView[] {
    const sorted = [...list].sort((a, b) => betRank(a) - betRank(b));
    const known = new Set(order.current);
    if (resortNext.current || order.current.length === 0) {
      order.current = sorted.map((c) => c.id);
      column.current = new Map(order.current.map((id, i) => [id, i % 2]));
      resortNext.current = false;
    } else {
      // A bet that settles leaves a gap; a new one waits at the end until the next re-sort, so nothing above it moves.
      const ids = new Set(list.map((c) => c.id));
      order.current = [...order.current.filter((id) => ids.has(id)), ...sorted.filter((c) => !known.has(c.id)).map((c) => c.id)];
      for (const id of order.current) {
        if (column.current.has(id)) continue;
        const left = order.current.filter((x) => column.current.get(x) === 0).length;
        const right = order.current.filter((x) => column.current.get(x) === 1).length;
        column.current.set(id, left <= right ? 0 : 1);
      }
    }
    const byId = new Map(list.map((c) => [c.id, c]));
    return order.current.map((id) => byId.get(id)!);
  }
  const data = views[view] ?? null;
  const all = data?.coupons ?? [];
  // Open bets: closest to paying first, bets that can no longer win last. Settled bets keep the server's order.
  const coupons = tab === 'open' ? heldOrder(all) : all;
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
  const isFresh = (n: NotificationItem | undefined) => {
    if (!n || seenAt === null) return false;
    const at = Date.parse(n.createdAt);
    return at > seenAt && at <= visitAt;
  };
  // A notification's bet can be shown if it is in a list we have, or may be in the settled list not loaded yet.
  const canOpen = (couponId: string) => !!views.open?.coupons.some((c) => c.id === couponId) || !views.settled || views.settled.coupons.some((c) => c.id === couponId);
  function openBet(couponId: string) {
    setAccount(false);
    // Not on Open means it settled; the Settled list loads if it hasn't yet, and the jump waits for it.
    setTab(views.open?.coupons.some((c) => c.id === couponId) ? 'open' : 'settled');
    setJump(couponId);
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
            <h1>
              <Wordmark />
            </h1>
            <div className="top-right">
              {/* While the tracker can't be reached the banner says so; a live count would be a guess. */}
              {!unreachable && <LiveIndicator poller={poller} />}
              {notes && <Notifications feed={notes} onRead={() => setNotes((prev) => prev && { ...prev, unread: 0, items: prev.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) })} onOpenBet={openBet} canOpen={canOpen} />}
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
                  <button
                    key={state}
                    className={TALLY[state].tone}
                    aria-label={`${bets.length} ${TALLY[state].label.toLowerCase()}, show ${bets.length === 1 ? 'it' : 'the first'}`}
                    onClick={() => jumpTo(bets[0]!.id)}
                  >
                    {/* Rebuilt when the count changes, so a change in standings wipes in like a plate. */}
                    <b key={bets.length}>{bets.length}</b>
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

        {/* Accounts made before emails were asked for: a reminder, never a wall. */}
        {me && !me.email && !emailLater && !account && (
          <div className="banner note" role="status">
            <span>Add your email so you can sign in with it, and reset your password once that’s possible.</span>
            <span className="actions">
              <button className="btn primary" onClick={() => setAccount(true)}>
                Add email
              </button>
              <button
                className="btn"
                onClick={() => {
                  putOffEmail();
                  setEmailLater(true);
                }}
              >
                Later
              </button>
            </span>
          </div>
        )}

        {account ? (
          <Account username={social?.username ?? null} me={me} onEmailSaved={(email) => setMe((m) => (m ? { ...m, email, emailVerified: false } : m))} onClose={() => setAccount(false)} onSignOut={doSignOut} />
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
              <main className={coupons.length > 1 ? 'list stacks' : 'list single'}>
                {/* Two stacks on a wide screen, dealt alternately so the order still reads top to bottom; one list on a phone. */}
                {[0, 1].map((col) => (
                  <div key={col} className="list-col">
                    {coupons.map((c, i) =>
                      (tab === 'open' ? column.current.get(c.id) : i % 2) === col ? (
                        <div key={c.id} style={{ order: i }}>
                          <CouponCard coupon={c} latest={latest.get(c.id)} fresh={isFresh(latest.get(c.id))} />
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

/** Brings a bet into view, moves focus to it, and replays its standing plate's wipe so the eye finds where it landed. */
function jumpTo(couponId: string) {
  const bet = document.getElementById(`bet-${couponId}`);
  if (!bet) return;
  bet.scrollIntoView({ block: 'start' });
  bet.querySelector<HTMLElement>('.bet-head')?.focus({ preventScroll: true });
  const plate = bet.querySelector<HTMLElement>('.bet-head .plate');
  if (plate) {
    plate.style.animation = 'none';
    void plate.offsetWidth;
    plate.style.animation = '';
  }
}

/** Brings a tapped notification's bet into view once its list has rendered. */
function useJump(jump: string | null, list: CouponView[] | undefined, done: () => void) {
  useEffect(() => {
    if (!jump || !list) return;
    // A bet that isn't in this list (settled since, or never synced) is simply not jumped to.
    if (list.some((c) => c.id === jump)) jumpTo(jump);
    done();
  }, [jump, list, done]);
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
  // The same bets the tally counts as Needs sync; a bet already dead or all hit keeps its own standing.
  const settled = data.coupons.filter((c) => betStanding(c).state === 'unsynced').length;
  // A day without a sync: new bets and results are missing.
  const oldSync = data.lastSyncedAt !== null && now - Date.parse(data.lastSyncedAt) > 24 * 3600_000;
  return (
    <p className="status">
      <span className={stale ? 'warn' : undefined}>{stale ? `Not updating · last updated ${updated}` : `Updated ${updated}`}</span>
      <span className={oldSync ? 'warn' : undefined}>{data.lastSyncedAt ? `Synced from Island Luck ${relativeTime(data.lastSyncedAt, now)}` : 'Not synced from Island Luck yet'}</span>
      {settled > 0 && (
        <a
          className="warn"
          href="https://islandluck.com/"
          target="_blank"
          rel="noreferrer"
          aria-label={`${settled === 1 ? '1 bet needs' : `${settled} bets need`} sync. Open Island Luck in a new tab`}
          title="Open My Bets on Island Luck to sync"
        >
          {settled === 1 ? '1 bet needs sync' : `${settled} bets need sync`} <Icon name="external" />
        </a>
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
