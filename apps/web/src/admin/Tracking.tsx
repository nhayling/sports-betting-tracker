import { useCallback, useEffect, useState } from 'react';
import { decidePlayer, fetchGamePlayers, fetchTracking, ignoreMarket, stopTrackingMarket, trackMarket, type GamePlayer, type MarketIssue, type PlayerIssue, type Tracking as TrackingData } from '../api';
import { dateTime } from '../format';
import { LoadError } from '../components/LoadError';
import type { Fail } from './Admin';

const SPORTS: Record<string, string> = { AMERICAN_FOOTBALL: 'Football', BASKETBALL: 'Basketball', BASEBALL: 'Baseball', ICE_HOCKEY: 'Hockey', FOOTBALL: 'Soccer' };
const REFRESH_POLL_MS = 3000;

const pickCount = (picks: number, open: number) => `${picks} ${picks === 1 ? 'pick' : 'picks'}${open ? `, ${open} open` : ''}`;

/** What makes a pick show "No stats" and only a person can settle: a player match, or a market with no stat behind it. */
export function Tracking({ fail, onCount }: { fail: Fail; onCount: (n: number) => void }) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      fetchTracking().then(
        (t) => {
          setData(t);
          setError(null);
          onCount(t.players.length + t.markets.length);
        },
        (err) => setError(fail(err)),
      ),
    [fail, onCount],
  );
  useEffect(() => void load(), [load]);

  // A fix re-reads its games in the background; follow along until they're done.
  const refreshing = data?.refresh.games ?? 0;
  useEffect(() => {
    if (!refreshing) return;
    const id = setTimeout(() => void load(), REFRESH_POLL_MS);
    return () => clearTimeout(id);
  }, [refreshing, data, load]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await run();
    } catch (err) {
      const message = fail(err);
      if (message) setActionError(message);
    } finally {
      await load();
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Tracking</h2>
        </div>
        {error ? <LoadError onRetry={() => void load()}>Can’t load tracking right now.</LoadError> : <p className="muted">Loading…</p>}
      </section>
    );
  }

  return (
    <>
      {refreshing > 0 && (
        <p className="banner note" role="status">
          <span>Re-reading {refreshing === 1 ? '1 game' : `${refreshing} games`} from ESPN. Picks update as each one finishes.</span>
        </p>
      )}
      {data.refresh.errors.length > 0 && refreshing === 0 && (
        <p className="banner error" role="alert">
          <span>Your fix is saved, but ESPN didn’t answer for every game, so some picks still show No stats: {data.refresh.errors[0]}</span>
        </p>
      )}
      {actionError && <p className="banner error" role="alert">{actionError}</p>}

      <section className="panel">
        <div className="panel-head">
          <h2>Players to match</h2>
          {data.players.length > 0 && <span className="muted admin-tally">{data.players.length} to fix</span>}
        </div>
        {data.players.length === 0 ? (
          <p className="admin-empty muted">Every player on a pick is matched.</p>
        ) : (
          <ul className="admin-list">
            {data.players.map((p) => (
              <PlayerRow key={p.participantId} player={p} busy={busy} act={act} fail={fail} onError={setActionError} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Markets to track</h2>
          {data.markets.length > 0 && <span className="muted admin-tally">{data.markets.length} to fix</span>}
        </div>
        <p className="admin-lede muted small">Applies to every pick on the market. A quarter, half or inning in the name is read from there; anything else counts the whole game, overtime included. Ignore a market whose stat isn’t listed.</p>
        {data.markets.length === 0 ? (
          <p className="admin-empty muted">Every market on a pick is tracked or ignored.</p>
        ) : (
          <ul className="admin-list">
            {data.markets.map((m) => (
              <MarketRow key={`${m.sport}|${m.marketName}`} market={m} busy={busy} act={act} />
            ))}
          </ul>
        )}
      </section>

      {(data.decisions.length > 0 || data.tracked.length > 0 || data.ignored.length > 0) && (
        <section className="panel">
          <div className="panel-head">
            <h2>Already decided</h2>
          </div>
          <ul className="admin-list">
            {data.tracked.map((m) => (
              <li key={`${m.sport}|${m.marketName}`} className="admin-row track-done">
                <span className="track-name">
                  {m.marketName} <span className="muted">→ {m.stat}, added by {m.addedBy}, {dateTime(m.addedAt)}</span>
                </span>
                <button className="btn" disabled={busy} onClick={() => void act(() => stopTrackingMarket(m.sport, m.marketName))}>
                  Stop tracking
                </button>
              </li>
            ))}
            {data.ignored.map((m) => (
              <li key={`${m.sport}|${m.marketName}`} className="admin-row track-done">
                <span className="track-name">
                  {m.marketName} <span className="muted">→ ignored</span>
                </span>
                <button className="btn" disabled={busy} onClick={() => void act(() => ignoreMarket(m.sport, m.marketName, false))}>
                  Put back
                </button>
              </li>
            ))}
            {data.decisions.map((d) => (
              <li key={d.participantId} className="admin-row track-done">
                <span className="track-name">
                  {d.name} <span className="muted">→ {d.linkedTo ?? 'no match'}, {dateTime(d.decidedAt)}</span>
                </span>
                <button className="btn" disabled={busy} onClick={() => void act(() => decidePlayer(d.participantId, { reset: true }))}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PlayerRow({ player: p, busy, act, fail, onError }: { player: PlayerIssue; busy: boolean; act: (run: () => Promise<unknown>) => Promise<void>; fail: Fail; onError: (m: string) => void }) {
  const [options, setOptions] = useState<GamePlayer[] | null>(null);
  const [loading, setLoading] = useState(false);

  const showEveryone = async () => {
    setLoading(true);
    try {
      setOptions((await fetchGamePlayers(p.participantId)).players);
    } catch (err) {
      const message = fail(err);
      if (message) onError(message);
    } finally {
      setLoading(false);
    }
  };
  const link = (playerId: string, playerName: string) => act(() => decidePlayer(p.participantId, { playerId, playerName }));

  return (
    <li className="admin-row track">
      <div className="admin-who-col">
        <span className="admin-name track-name">{p.name}</span>
        <span className="muted small block">
          {pickCount(p.picks, p.openPicks)}
          {p.game && ` · ${p.game}`}
          {p.startAt && ` · ${dateTime(p.startAt)}`}
        </span>
      </div>
      <span className="actions">
        {options ? (
          <select
            className="track-pick"
            aria-label={`ESPN player for ${p.name}`}
            value=""
            disabled={busy}
            onChange={(e) => {
              const chosen = options.find((o) => o.id === e.target.value);
              if (chosen) void link(chosen.id, chosen.name);
            }}
          >
            <option value="">Choose a player…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.position ? ` (${o.position})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <>
            {p.candidates.map((c) => (
              <button key={c.id} className="btn primary" disabled={busy} onClick={() => void link(c.id, c.name)}>
                It’s {c.name}
              </button>
            ))}
            <button className="btn" disabled={busy || loading} onClick={() => void showEveryone()}>
              {loading ? 'Loading…' : p.candidates.length ? 'Someone else' : 'Choose a player'}
            </button>
          </>
        )}
        <button className="btn" disabled={busy} onClick={() => void act(() => decidePlayer(p.participantId, { noMatch: true }))}>
          No match
        </button>
      </span>
    </li>
  );
}

function MarketRow({ market: m, busy, act }: { market: MarketIssue; busy: boolean; act: (run: () => Promise<unknown>) => Promise<void> }) {
  const [metric, setMetric] = useState('');
  return (
    <li className="admin-row track">
      <div className="admin-who-col">
        <span className="admin-name track-name">{m.marketName}</span>
        <span className="muted small block">
          {SPORTS[m.sport] ?? m.sport} · {pickCount(m.picks, m.openPicks)}
          {m.example && ` · ${m.example}`}
        </span>
      </div>
      <span className="actions">
        {m.stats.length === 0 ? (
          <span className="muted small">No stat fits this market.</span>
        ) : (
          <>
            <select className="track-pick" aria-label={`Stat for ${m.marketName}`} value={metric} disabled={busy} onChange={(e) => setMetric(e.target.value)}>
              <option value="">Choose a stat…</option>
              {m.stats.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="btn primary" disabled={busy || !metric} onClick={() => void act(() => trackMarket(m.sport, m.marketName, metric))}>
              Track
            </button>
          </>
        )}
        <button className="btn" disabled={busy} onClick={() => void act(() => ignoreMarket(m.sport, m.marketName, true))}>
          Ignore
        </button>
      </span>
    </li>
  );
}
