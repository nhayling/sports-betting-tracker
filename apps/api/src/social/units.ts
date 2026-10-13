import { weekOf } from '../analysis/compute';
import { MIN_BETS, type Period, type UnitStats } from './types';

/**
 * Leaderboard scoring. Every bet counts as one unit whatever was staked, so a
 * record says how good the picks were without saying how much money was on
 * them. Only Island Luck's official results count.
 */

export interface UnitBet {
  status: string;
  /** Null on system coupons (several bets, no single price). */
  oddsRaw: number | null;
  stakeMinor: number;
  payoutMinor: number;
  rewardType: string | null;
  placedAt: Date | null;
}

/**
 * Units won or lost on one bet; null when it doesn't count (open, void,
 * unknown). Free bets count like any other: units score the pick, not whose
 * money was on it.
 */
export function betUnits(b: UnitBet): number | null {
  const returned = b.stakeMinor > 0 ? b.payoutMinor / b.stakeMinor - 1 : null;
  switch (b.status) {
    case 'WON':
      return b.oddsRaw && b.oddsRaw > 1000 ? b.oddsRaw / 1000 - 1 : returned;
    case 'LOST':
      return -1;
    // What came back per unit staked. A ratio, so it gives nothing away about the stake.
    case 'CASHED_OUT':
    case 'MIXED':
      return returned;
    default:
      return null;
  }
}

export function unitStats(bets: UnitBet[]): UnitStats {
  const s: UnitStats = { bets: 0, won: 0, lost: 0, other: 0, units: 0, roi: null, bestHitOddsRaw: null };
  for (const b of bets) {
    const u = betUnits(b);
    if (u === null) continue;
    s.bets++;
    s.units += u;
    if (b.status === 'WON') {
      s.won++;
      if (b.oddsRaw && b.oddsRaw > (s.bestHitOddsRaw ?? 0)) s.bestHitOddsRaw = b.oddsRaw;
    } else if (b.status === 'LOST') s.lost++;
    else s.other++;
  }
  s.units = Math.round(s.units * 100) / 100;
  s.roi = s.bets > 0 ? s.units / s.bets : null;
  return s;
}

/** Net winnings in cents on settled bets: returned − own money staked (free-bet stakes aren't your money). */
export function netMinor(bets: UnitBet[]): number {
  return bets.filter((b) => b.status !== 'OPEN').reduce((n, b) => n + b.payoutMinor - (b.rewardType === 'FREE_BET' ? 0 : b.stakeMinor), 0);
}

const nassauMonth = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Nassau', year: 'numeric', month: '2-digit' }).format(d);

/** Bets placed in the current week (from Monday) or calendar month, Nassau time. */
export function inPeriod(placedAt: Date | null, period: Period, now: Date): boolean {
  if (period === 'all') return true;
  if (!placedAt) return false;
  return period === 'week' ? weekOf(placedAt) === weekOf(now) : nassauMonth(placedAt) === nassauMonth(now);
}

/**
 * Ranks by units (then ROI, then name) among those with enough settled bets;
 * everyone else follows unranked, most bets first.
 */
export function rank<T extends UnitStats & { username: string }>(rows: T[], period: Period): Array<T & { rank: number | null }> {
  const qualified = rows.filter((r) => r.bets >= MIN_BETS[period]).sort((a, b) => b.units - a.units || (b.roi ?? 0) - (a.roi ?? 0) || a.username.localeCompare(b.username));
  const rest = rows.filter((r) => r.bets < MIN_BETS[period]).sort((a, b) => b.bets - a.bets || a.username.localeCompare(b.username));
  return [...qualified.map((r, i) => ({ ...r, rank: i + 1 })), ...rest.map((r) => ({ ...r, rank: null }))];
}
