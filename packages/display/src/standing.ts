/**
 * Where a pick and a bet stand by live stats. Shared by the web app (plates, tally, sorting)
 * and the server (notification wording), so both always name the same bets the same way.
 * Typed structurally, so it needs nothing from the API's view types.
 */
export interface StandingPick {
  status: string;
  type: string;
  display: string | null;
  /** Moneyline or spread: which side of the game the pick is on. */
  moneylineSide: 'home' | 'away' | null;
  /** Spread: the picked side's line (+5 for an underdog getting five). Total: the points line. */
  line?: number | null;
  /** Total: OVER or UNDER. */
  selectionSide?: string | null;
  progress: { status: string; metric: string | null } | null;
}
type Scores = { homeScore: number | null; awayScore: number | null };

/**
 * A game pick's margin from its own side. Moneyline: the score difference.
 * Spread: that plus the line. Total: points over the line for an over, under it
 * for an under. Above 0 wins (or covers), 0 is a tie (or push). Null when the
 * side or the line isn't known.
 */
export function gameMargin(p: Pick<StandingPick, 'type' | 'moneylineSide' | 'line' | 'selectionSide'>, st: Scores): number | null {
  if (p.type === 'TOTAL') {
    if (p.line === null || p.line === undefined || (p.selectionSide !== 'OVER' && p.selectionSide !== 'UNDER')) return null;
    const total = (st.homeScore ?? 0) + (st.awayScore ?? 0);
    return p.selectionSide === 'OVER' ? total - p.line : p.line - total;
  }
  if (!p.moneylineSide) return null;
  const line = p.type === 'SPREAD' ? p.line : 0;
  if (line === null || line === undefined) return null;
  return (p.moneylineSide === 'home' ? 1 : -1) * ((st.homeScore ?? 0) - (st.awayScore ?? 0)) + line;
}

export interface StandingGame {
  state: { state: string; homeScore: number | null; awayScore: number | null } | null;
  picks: StandingPick[];
}
export interface StandingCoupon {
  probablySettled: string | null;
  games: StandingGame[];
}


/**
 * Where a pick stands. `missed` is final and cannot come back; `risk` is a line
 * crossed mid-game that the stat can still move back across (a rusher over his
 * under who then loses yards), so it never counts a bet out. `reached` is the
 * same the other way: a yardage over that is there for now but can still drop.
 */
export type PickState = 'hit' | 'reached' | 'missed' | 'risk' | 'running' | 'waiting' | 'void';

export function pickState(p: StandingPick, game: StandingGame): PickState {
  if (p.status === 'WON') return 'hit';
  if (p.status === 'LOST') return 'missed';
  if (p.status === 'VOID') return 'void';

  if (p.type === 'MONEYLINE' || p.type === 'SPREAD' || p.type === 'TOTAL') {
    const st = game.state;
    const margin = st ? gameMargin(p, st) : null;
    if (!st || st.state === 'SCHEDULED' || margin === null) return 'waiting';
    if (st.state !== 'FINAL') {
      // Points only go up: an over past its line has won, an under past it has lost, mid-game.
      if (p.type === 'TOTAL' && p.selectionSide === 'OVER' && margin > 0) return 'hit';
      if (p.type === 'TOTAL' && p.selectionSide === 'UNDER' && margin < 0) return 'missed';
      return 'running';
    }
    // A spread or total landing on the line is a push: the pick is voided and the bet rides on.
    return margin > 0 ? 'hit' : margin < 0 ? 'missed' : p.type === 'MONEYLINE' ? 'waiting' : 'void';
  }

  switch (p.progress?.status) {
    case 'TARGET_REACHED':
      // Yards can be lost again before the final; touchdowns, catches and other counts cannot.
      return p.display !== 'BINARY' && /YARDS/.test(p.progress.metric ?? '') ? 'reached' : 'hit';
    case 'FINAL_HIT':
      return 'hit';
    case 'FINAL_MISSED':
      return 'missed';
    case 'TARGET_EXCEEDED':
      return 'risk';
    case undefined:
    case 'UNAVAILABLE':
    case 'NOT_STARTED':
      return 'waiting';
    default:
      return p.type === 'OTHER' ? 'waiting' : 'running';
  }
}

/** Where an open bet stands, from live stats. Island Luck's own status is shown separately. */
/** `unsynced`: every game is over but Island Luck's result hasn't been synced, so live stats have nothing more to say. */
export type BetState = 'needs-one' | 'risk' | 'alive' | 'all-hit' | 'unsynced' | 'waiting' | 'dead';

export interface BetStanding {
  state: BetState;
  /** Picks that count: void picks are left out. */
  counted: number;
  hit: number;
  left: number;
}

export function betStanding(c: StandingCoupon): BetStanding {
  const states = c.games.flatMap((g) => g.picks.map((p) => pickState(p, g))).filter((s) => s !== 'void');
  const counted = states.length;
  const hit = states.filter((s) => s === 'hit').length;
  const left = counted - hit;
  const state: BetState = states.includes('missed')
    ? 'dead'
    : c.probablySettled && left > 0
      ? 'unsynced'
      : states.includes('risk')
      ? 'risk'
      : counted > 0 && left === 0
        ? 'all-hit'
        : counted > 1 && left === 1
          ? 'needs-one'
          : hit > 0 || states.includes('running') || states.includes('reached')
            ? 'alive'
            : 'waiting';
  return { state, counted, hit, left };
}

/** Closest to paying first; bets that can no longer win last. */
export const ORDER: BetState[] = ['needs-one', 'risk', 'alive', 'all-hit', 'unsynced', 'waiting', 'dead'];
export const betRank = (c: StandingCoupon) => ORDER.indexOf(betStanding(c).state);
