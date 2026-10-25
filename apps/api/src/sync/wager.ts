import type { ParsedCoupon } from '@sports-better/kambi';

/**
 * Why `next` isn't the bet `before` was, or null when it is. Anyone can send a coupon, so once
 * one is seen, what was bet is fixed: otherwise a pick could be swapped for the winning side
 * after the game. Kambi's own updates only settle a bet, so status, payout and results may
 * change; so may the stake (a partial cash out lowers it), start times (games move) and odds
 * downwards (a void leg shortens a parlay). Odds going up is never a settlement.
 */
export function changedWager(before: ParsedCoupon, next: ParsedCoupon): string | null {
  if (before.placedAt !== next.placedAt) return 'placement time';

  const bets = (c: ParsedCoupon) => new Map(c.bets.map((b) => [b.externalBetRef, b]));
  const [was, now] = [bets(before), bets(next)];
  if (was.size !== now.size || [...was.keys()].some((ref) => !now.has(ref))) return 'bets';
  for (const [ref, b] of was) {
    const n = now.get(ref)!;
    if (rows(b.legs) !== rows(n.legs)) return 'picks';
    if (higher(b.oddsRaw, n.oddsRaw)) return 'odds';
  }

  const legs = (c: ParsedCoupon) => new Map(c.bets.flatMap((b) => b.legs).map((l) => [l.externalRowIndex, l]));
  const [legsWas, legsNow] = [legs(before), legs(next)];
  for (const [row, l] of legsWas) {
    const n = legsNow.get(row)!;
    if (l.eventId !== n.eventId || picks(l) !== picks(n)) return 'picks';
    if (higher(l.oddsRaw, n.oddsRaw)) return 'odds';
  }
  return null;
}

const rows = (legs: { externalRowIndex: number }[]) => legs.map((l) => l.externalRowIndex).sort((a, b) => a - b).join(',');
const picks = (l: ParsedCoupon['bets'][number]['legs'][number]) =>
  l.selections.map((s) => `${s.externalOutcomeId}@${s.lineRaw}`).sort().join(',');
const higher = (was: number | null, now: number | null) => was !== null && now !== null && now > was;
