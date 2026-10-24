import type { FightResult } from '@sports-better/sports-data';

/**
 * UFC markets, read from Island Luck's names. Fights have no score, so each
 * kind is graded from how the bout ended: who won, how, and when.
 */
export type FightPick =
  /** "Bout Odds": who wins. */
  | { kind: 'WINNER'; fighter: string }
  /** "Total Rounds" Over 1.5: the fight lasts past 2:30 of round 2. */
  | { kind: 'ROUNDS'; over: boolean; line: number }
  /** "To go the distance": to the judges. */
  | { kind: 'DISTANCE'; yes: boolean }
  /** "X to win by Decision", "X to win by Finish", "Any Fighter to win by Submission". Fighter null = either. */
  | { kind: 'METHOD'; fighter: string | null; method: 'DECISION' | 'FINISH' | 'KO_TKO' | 'SUBMISSION'; yes: boolean }
  /** "X to Win & Over 1.5 Rounds". */
  | { kind: 'WIN_AND_ROUNDS'; fighter: string; over: boolean; line: number; yes: boolean }
  /** "Fight to start Round 2". */
  | { kind: 'STARTS_ROUND'; round: number; yes: boolean }
  /** "Any Fighter to win in Round 1": a finish in that round. */
  | { kind: 'WINS_IN_ROUND'; round: number; yes: boolean };

const FIGHT_MARKETS: RegExp[] = [
  /^Bout Odds$/i,
  /^Total Rounds$/i,
  /^To go the distance$/i,
  /^.+ to win by (?:Decision|Finish)$/i,
  /^Any Fighter to win by (?:KO, TKO or DQ|Submission)$/i,
  /^.+ to Win & (?:Over|Under) \d+(?:\.\d+)? Rounds$/i,
  /^Fight to start Round \d+$/i,
  /^Any Fighter to win in Round \d+$/i,
];

export const isFightMarket = (marketName: string) => FIGHT_MARKETS.some((re) => re.test(marketName.trim()));

/**
 * A UFC pick, or null if the market isn't one of these. `pick` is the picked
 * fighter's name for "Bout Odds" (already resolved from Kambi's "1"/"2"), else
 * unused; `side` is YES/NO or OVER/UNDER.
 */
export function fightPick(marketName: string | null, pick: string | null, side: string | null, line: number | null): FightPick | null {
  const name = marketName?.trim() ?? '';
  const yes = side !== 'NO';
  if (/^Bout Odds$/i.test(name)) return pick ? { kind: 'WINNER', fighter: pick } : null;
  if (/^Total Rounds$/i.test(name)) return line !== null && (side === 'OVER' || side === 'UNDER') ? { kind: 'ROUNDS', over: side === 'OVER', line } : null;
  if (/^To go the distance$/i.test(name)) return { kind: 'DISTANCE', yes };
  let m = /^(.+) to win by (Decision|Finish)$/i.exec(name);
  if (m) return { kind: 'METHOD', fighter: m[1]!, method: m[2]!.toUpperCase() as 'DECISION' | 'FINISH', yes };
  m = /^Any Fighter to win by (KO, TKO or DQ|Submission)$/i.exec(name);
  if (m) return { kind: 'METHOD', fighter: null, method: /submission/i.test(m[1]!) ? 'SUBMISSION' : 'KO_TKO', yes };
  m = /^(.+) to Win & (Over|Under) (\d+(?:\.\d+)?) Rounds$/i.exec(name);
  if (m) return { kind: 'WIN_AND_ROUNDS', fighter: m[1]!, over: /over/i.test(m[2]!), line: Number(m[3]), yes };
  m = /^Fight to start Round (\d+)$/i.exec(name);
  if (m) return { kind: 'STARTS_ROUND', round: Number(m[1]), yes };
  m = /^Any Fighter to win in Round (\d+)$/i.exec(name);
  if (m) return { kind: 'WINS_IN_ROUND', round: Number(m[1]), yes };
  return null;
}

/** 1 won, -1 lost, 0 void (a draw on who wins), null not decided or not knowable from ESPN. Final fights only. */
export type FightGrade = 1 | -1 | 0 | null;

/**
 * Grades a pick once the fight is over. `sideOf` places a fighter's name on
 * ESPN's home/away. A finish whose method ESPN doesn't give (KO or
 * submission?) stays null rather than being guessed.
 */
export function gradeFight(pick: FightPick, fight: FightResult, sideOf: (fighter: string) => 'home' | 'away' | null): FightGrade {
  const { winner, method, round, clockSeconds, scheduledRounds } = fight;
  if (round === null || clockSeconds === null) return null;
  // To the final bell, whatever the judges said (a draw goes the distance too).
  const distance = method === 'DECISION' || (round === scheduledRounds && clockSeconds >= 300);
  const finish = winner !== null && !distance;
  const elapsed = round - 1 + clockSeconds / 300;
  const grade = (hit: boolean, yes = true): FightGrade => (hit === yes ? 1 : -1);
  const won = (fighter: string) => {
    const side = sideOf(fighter);
    return side === null ? null : winner === side;
  };

  switch (pick.kind) {
    case 'WINNER': {
      if (winner === null) return 0;
      const w = won(pick.fighter);
      return w === null ? null : grade(w);
    }
    case 'ROUNDS':
      return elapsed === pick.line ? 0 : grade(pick.over ? elapsed > pick.line : elapsed < pick.line);
    case 'DISTANCE':
      return grade(distance, pick.yes);
    case 'METHOD': {
      const w = pick.fighter === null ? winner !== null : won(pick.fighter);
      if (w === null) return null;
      if (pick.method === 'DECISION') return grade(w && distance, pick.yes);
      if (pick.method === 'FINISH') return grade(w && finish, pick.yes);
      if (!w || !finish) return grade(false, pick.yes);
      if (method === null) return null;
      return grade(method === pick.method, pick.yes);
    }
    case 'WIN_AND_ROUNDS': {
      const w = won(pick.fighter);
      if (w === null) return null;
      return grade(w && (pick.over ? elapsed > pick.line : elapsed < pick.line), pick.yes);
    }
    case 'STARTS_ROUND':
      // A stoppage at the very end of a round (5:00) still leaves the next round unstarted.
      return grade(round >= pick.round, pick.yes);
    case 'WINS_IN_ROUND':
      return grade(finish && round === pick.round, pick.yes);
  }
}
