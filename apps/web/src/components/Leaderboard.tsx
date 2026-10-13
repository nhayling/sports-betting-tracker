import { useEffect, useState } from 'react';
import { fetchLeaderboard, SignedOutError, type LeaderboardView, type Period } from '../api';
import { americanOdds, money, units } from '../format';

const PERIODS: Array<[Period, string]> = [
  ['week', 'Week'],
  ['month', 'Month'],
  ['all', 'All time'],
];
const PERIOD_PHRASE: Record<Period, string> = { week: 'placed this week', month: 'placed this month', all: 'in total' };

export const nameOf = (p: { username: string; displayName: string | null }) => p.displayName ?? p.username;
/** Units per bet as a percentage: 0.375 → "+38%". */
export const roiPct = (r: number | null) => (r === null ? '—' : `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(Math.round(r * 100))}%`);
export const unitsClass = (u: number) => (u > 0 ? 'good' : u < 0 ? 'bad' : '');
const signedMoney = (minor: number) => `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${money(Math.abs(minor))}`;

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Period">
      {PERIODS.map(([p, label]) => (
        <button key={p} className={value === p ? 'on' : ''} aria-pressed={value === p} onClick={() => onChange(p)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** `hidden`: you've taken yourself off the board in Settings. */
export function Leaderboard({ hidden, onOpen, onSettings, onSignedOut }: { hidden: boolean; onOpen: (username: string) => void; onSettings: () => void; onSignedOut: () => void }) {
  const [period, setPeriod] = useState<Period>('week');
  const [board, setBoard] = useState<LeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setBoard(null);
    fetchLeaderboard(period).then(
      (b) => {
        if (stale) return;
        setBoard(b);
        setError(null);
      },
      (err) => (err instanceof SignedOutError ? onSignedOut() : setError(String(err.message ?? err))),
    );
    return () => {
      stale = true;
    };
  }, [period, onSignedOut]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Leaderboard</h2>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {error && <p className="banner error">{error}</p>}
      {!board && !error && <p className="muted center">Loading…</p>}
      {board && <LeaderboardTable board={board} onOpen={onOpen} />}
      {hidden && (
        <p className="muted small">
          You’re hidden from the leaderboard.{' '}
          <button className="link" onClick={onSettings}>
            Change in Settings
          </button>
        </p>
      )}
    </section>
  );
}

export function LeaderboardTable({ board, onOpen }: { board: LeaderboardView; onOpen: (username: string) => void }) {
  if (board.rows.length === 0) return <p className="muted center">Nobody is on the leaderboard yet.</p>;
  // The dollar column only exists once someone has chosen to share theirs.
  const showNet = board.rows.some((r) => r.netMinor !== null);
  const anyOther = board.rows.some((r) => r.other > 0);

  return (
    <>
      <table className="table board">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Name</th>
            <th className="num">Units</th>
            <th className="num">Record</th>
            <th className="num wide-only">ROI</th>
            <th className="num wide-only">Best hit</th>
            {showNet && <th className="num">Net</th>}
          </tr>
        </thead>
        <tbody>
          {board.rows.map((r) => (
            <tr key={r.username} className={r.isYou ? 'you' : undefined}>
              <td className="num rank">{r.rank ?? '–'}</td>
              <td>
                <button className="name-link" onClick={() => onOpen(r.username)}>
                  {nameOf(r)}
                </button>
                {r.isYou && <span className="chip">You</span>}
                {r.isFriend && <span className="chip">Friend</span>}
                {r.rank === null && (
                  <span className="muted small block">
                    {r.bets} of {board.minBets} bets to rank
                  </span>
                )}
              </td>
              <td className={`num ${unitsClass(r.units)}`}>{r.bets > 0 ? <strong>{units(r.units)}</strong> : '—'}</td>
              <td className="num">
                {r.won}–{r.lost}
                {r.other > 0 && <span className="muted"> (+{r.other})</span>}
              </td>
              <td className="num wide-only">{roiPct(r.roi)}</td>
              <td className="num wide-only">{r.bestHitOddsRaw ? americanOdds(r.bestHitOddsRaw) : '—'}</td>
              {showNet && (
                <td className="num">
                  {r.netMinor === null ? (
                    <span className="muted" title="Not shared">
                      —
                    </span>
                  ) : (
                    signedMoney(r.netMinor)
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Every bet counts as one unit, whatever was staked: a win at +300 is +3.00u and a loss is −1.00u. You’re ranked once you have {board.minBets} settled
        bets {PERIOD_PHRASE[board.period]}. Only Island Luck’s official results count.
        {anyOther && ' (+1) is a cashed-out bet, scored at what it returned.'}
        {showNet && ' Net appears only for people who chose to share it.'}
      </p>
    </>
  );
}
