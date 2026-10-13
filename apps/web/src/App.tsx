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
import { Notifications } from './components/Notifications';
import { Analysis } from './components/Analysis';
import { PhoneSync } from './components/PhoneSync';
import { Register } from './components/Register';
import { SignIn } from './components/SignIn';
import { Social } from './components/Social';
import { CouponCard } from './components/CouponCard';
import { clockTime, money, relativeTime } from './format';

type Tab = 'open' | 'settled' | 'analysis' | 'social';
const TABS: Array<[Tab, string]> = [
  ['open', 'Open'],
  ['settled', 'Settled'],
  ['analysis', 'Analysis'],
  ['social', 'Social'],
];
const REFRESH_MS = 15_000;

/** The Social tab keeps its own place after the slash (#social/people). */
function tabFromHash(): Tab {
  const name = location.hash.slice(1).split('/')[0];
  return name === 'settled' || name === 'analysis' || name === 'social' ? name : 'open';
}

export function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, '', t === 'open' ? location.pathname : `#${t}`);
  };
  const [data, setData] = useState<BetsView | null>(null);
  const [poller, setPoller] = useState<PollerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const [phoneSync, setPhoneSync] = useState(false);
  const onSignedOut = useCallback(() => setSignedOut(true), []);

  const load = useCallback(async () => {
    try {
      const [bets, status, feed, me] = await Promise.all([
        fetchBets(tab === 'settled' ? 'settled' : 'open'),
        fetchPollerStatus().catch(() => null),
        fetchNotifications().catch(() => null),
        fetchSocialMe().catch(() => null),
      ]);
      setData(bets);
      setPoller(status);
      if (feed) setNotes(feed);
      if (me) setSocial(me);
      setError(null);
    } catch (err) {
      if (err instanceof SignedOutError) setSignedOut(true);
      else setError(err instanceof Error ? err.message : String(err));
    }
  }, [tab]);

  useEffect(() => {
    if (signedOut || invite) return;
    setData(null);
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

  const coupons = data?.coupons ?? [];
  const staked = coupons.reduce((n, c) => n + (c.stakeMinor ?? 0), 0);
  const toPay = coupons.reduce((n, c) => n + (c.potentialPayoutMinor ?? 0), 0);
  const returned = coupons.reduce((n, c) => n + (c.payoutMinor ?? 0), 0);

  return (
    <div className="app">
      <header className="shell">
        <div className="wrap">
          <div className="top">
            <h1>Sports Better</h1>
            <div className="top-right">
              {notes && <Notifications feed={notes} onRead={() => setNotes({ ...notes, unread: 0 })} />}
              <button className="link" aria-expanded={phoneSync} onClick={() => setPhoneSync(!phoneSync)}>
                Phone sync
              </button>
              <button
                className="link"
                onClick={async () => {
                  await signOut().catch(() => {});
                  setSignedOut(true);
                }}
              >
                Sign out
              </button>
            </div>
          </div>

          {/* How fresh everything is: live stats, then the last sync from Island Luck. */}
          <div className="status">
            <LiveIndicator poller={poller} updatedAt={data?.generatedAt ?? null} />
            {data && <SyncLine lastSyncedAt={data.lastSyncedAt} stale={coupons.filter((c) => c.probablySettled).length} />}
          </div>

          <nav className="tabs" role="tablist">
            {TABS.map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
                {label}
                {t === 'social' && !!social?.pendingRequests && (
                  <span className="count" aria-label={`${social.pendingRequests} waiting`}>
                    {social.pendingRequests}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {betsTab && data && (
          <section className="totals">
            <div className="wrap">
              {tab === 'open' ? (
                <>
                  <Stat label="Open bets" value={String(coupons.length)} />
                  <Stat label="At stake" value={money(staked)} />
                  <Stat label="Potential return" value={money(toPay)} />
                </>
              ) : (
                <>
                  <Stat label="Settled bets" value={String(coupons.length)} />
                  <Stat label="Staked" value={money(staked)} />
                  <Stat label="Returned" value={money(returned)} />
                </>
              )}
            </div>
          </section>
        )}
      </header>

      <div className="wrap page">
        {phoneSync && <PhoneSync onClose={() => setPhoneSync(false)} />}

        {tab === 'analysis' && <Analysis onSignedOut={onSignedOut} />}
        {tab === 'social' && <Social me={social} onChanged={refreshSocial} onSignedOut={onSignedOut} />}

        {error && <p className="banner error">{error}</p>}
        {betsTab && !data && !error && <p className="muted center">Loading…</p>}
        {betsTab && data && coupons.length === 0 && (
          <p className="muted center">{tab === 'open' ? 'No open bets. Sync from Island Luck to pick up new ones.' : 'No settled bets yet.'}</p>
        )}

        {betsTab && (
          <main className="list">
            {coupons.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </main>
        )}
      </div>
    </div>
  );
}

function SyncLine({ lastSyncedAt, stale }: { lastSyncedAt: string | null; stale: number }) {
  return (
    <p className={`sync-line ${stale ? 'warn' : 'muted'}`}>
      Last synced from Island Luck {relativeTime(lastSyncedAt)}
      {stale > 0 && ` · ${stale} bet${stale === 1 ? '' : 's'} probably settled, open My Bets to update`}
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

function LiveIndicator({ poller, updatedAt }: { poller: PollerStatus | null; updatedAt: string | null }) {
  if (!poller?.running) return <span className="live-indicator off">Live stats off</span>;
  const live = poller.lastReport?.liveEvents ?? 0;
  const paused = poller.provider?.pausedUntil;
  return (
    <span className={`live-indicator ${live ? 'on' : ''}`} title={updatedAt ? `Updated ${clockTime(updatedAt)}` : undefined}>
      {paused ? (
        'Stats paused (rate limit)'
      ) : live ? (
        <>
          <span className="live-dot" aria-hidden /> {live} live game{live === 1 ? '' : 's'}
        </>
      ) : (
        'No live games'
      )}
      {updatedAt && <span className="muted"> · {clockTime(updatedAt)}</span>}
    </span>
  );
}
