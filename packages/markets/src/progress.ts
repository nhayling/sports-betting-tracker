import type { GameState } from '@sports-better/sports-data';
import type { PropTarget } from './classify';

/**
 * Live progress toward a prop, from stats alone. This is a *suggestion*:
 * it never changes the sportsbook's settlement, and the UI must label it
 * separately from Kambi's status.
 */

export type ProgressStatus =
  /** Over-type target met (for now; yardage can still go down). */
  | 'TARGET_REACHED'
  /** Under-type prop has gone over; it can't come back for counting stats. */
  | 'TARGET_EXCEEDED'
  | 'IN_PROGRESS'
  /** Game over and stats say the prop missed / held. Still not official. */
  | 'FINAL_MISSED'
  | 'FINAL_HIT'
  | 'NOT_STARTED';

export interface Progress {
  status: ProgressStatus;
  current: number;
  target: number;
  /** Smallest whole value that satisfies an over-type prop (38.5 → 39, 80+ → 80). */
  needed: number | null;
  /** Units still needed for over-type props; null for under-type. */
  remaining: number | null;
  /** 0..1 for over-type props, for a progress bar. */
  fraction: number | null;
}

export function evaluateProgress(prop: PropTarget, current: number | null, game: GameState): Progress | null {
  if (game === 'SCHEDULED') {
    return { status: 'NOT_STARTED', current: 0, target: prop.target, needed: needed(prop), remaining: needed(prop), fraction: 0 };
  }
  // Never fabricate: no stat and no live/final game means no progress.
  if (current === null || (game !== 'LIVE' && game !== 'FINAL')) return null;

  const final = game === 'FINAL';
  if (prop.operator === 'GTE' || prop.operator === 'GT') {
    const need = needed(prop)!;
    const met = current >= need;
    return {
      status: met ? (final ? 'FINAL_HIT' : 'TARGET_REACHED') : final ? 'FINAL_MISSED' : 'IN_PROGRESS',
      current,
      target: prop.target,
      needed: need,
      remaining: Math.max(need - current, 0),
      // Yardage can be negative (−6 rush yds): clamp to an empty bar.
      fraction: need > 0 ? Math.min(Math.max(current / need, 0), 1) : 1,
    };
  }

  const stillUnder = prop.operator === 'LT' ? current < prop.target : current <= prop.target;
  return {
    status: !stillUnder ? (final ? 'FINAL_MISSED' : 'TARGET_EXCEEDED') : final ? 'FINAL_HIT' : 'IN_PROGRESS',
    current,
    target: prop.target,
    needed: null,
    remaining: null,
    fraction: null,
  };
}

function needed(prop: PropTarget): number | null {
  if (prop.operator === 'GTE') return prop.target;
  if (prop.operator === 'GT') return Math.floor(prop.target) + 1;
  return null;
}
