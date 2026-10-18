import type { StatKey } from '@sports-better/sports-data';

/**
 * Turns a sportsbook market into something live stats can be measured
 * against. Tracker-owned: the Kambi parser only reports what Kambi sent
 * (criterion text, side, line); deciding what that means happens here.
 *
 * Only exact, known market names are supported. Anything else, including
 * half/quarter variants, is "unsupported" and shows no progress rather than
 * a guess.
 */

export type Operator = 'GTE' | 'GT' | 'LT' | 'LTE';

export interface PropTarget {
  metric: StatKey;
  /** PLAYER: one player's stat. GAME: the stat summed over everyone in the game (e.g. total field goals). */
  scope: 'PLAYER' | 'GAME';
  operator: Operator;
  /** In stat units (80 yards, 38.5 yards, 1 TD). */
  target: number;
  /** Binary props (TD scorer) show ✓/○ instead of a progress bar. */
  display: 'PROGRESS' | 'BINARY';
}

export type Classification =
  | ({ supported: true } & PropTarget)
  | { supported: false; reason: 'UNSUPPORTED_SPORT' | 'UNSUPPORTED_MARKET' | 'MISSING_LINE' | 'LINE_MISMATCH' | 'UNSUPPORTED_SIDE' };

export interface MarketInput {
  sport: string | null;
  marketName: string | null;
  selectionSide: 'YES' | 'NO' | 'OVER' | 'UNDER' | null;
  /** Kambi line in stat units (already ÷1000). */
  line: number | null;
}

const FOOTBALL_SPORTS = new Set(['AMERICAN_FOOTBALL']);
const FULL_GAME = '(?: - Including Overtime)?';

const RUSH_REC = 'Rushing (?:&|and) Receiving Yards';
/**
 * Kambi names this one "25+ Pass Attempts" / "Total Pass Attempts", with no
 * "By The Player" and no overtime suffix. ESPN can't separate overtime, so it
 * counts the full game like every other stat.
 */
const PASS_ATTEMPTS = 'Pass Attempts(?: By The Player)?';

/** "80+ Rushing Yards By The Player - Including Overtime" + Yes → RUSHING_YARDS ≥ 80 */
const THRESHOLD_MARKETS: Array<[RegExp, StatKey]> = [
  [new RegExp(`^(\\d+)\\+ ${RUSH_REC} By The Player${FULL_GAME}$`, 'i'), 'RUSHING_RECEIVING_YARDS'],
  [new RegExp(`^(\\d+)\\+ Rushing Yards By The Player${FULL_GAME}$`, 'i'), 'RUSHING_YARDS'],
  [new RegExp(`^(\\d+)\\+ Receiving Yards By The Player${FULL_GAME}$`, 'i'), 'RECEIVING_YARDS'],
  [new RegExp(`^(\\d+)\\+ Passing Yards By The Player${FULL_GAME}$`, 'i'), 'PASSING_YARDS'],
  [new RegExp(`^(\\d+)\\+ Receptions By The Player${FULL_GAME}$`, 'i'), 'RECEPTIONS'],
  [new RegExp(`^(\\d+)\\+ Touchdown Passes By The Player${FULL_GAME}$`, 'i'), 'PASSING_TDS'],
  [new RegExp(`^(\\d+)\\+ Pass Completions By The Player${FULL_GAME}$`, 'i'), 'PASS_COMPLETIONS'],
  [new RegExp(`^(\\d+)\\+ ${PASS_ATTEMPTS}${FULL_GAME}$`, 'i'), 'PASS_ATTEMPTS'],
];

/** "Total Receiving Yards by the Player - Including Overtime" + Over 38.5 → RECEIVING_YARDS > 38.5 */
const OVER_UNDER_MARKETS: Array<[RegExp, StatKey]> = [
  [new RegExp(`^Total ${RUSH_REC} by the Player${FULL_GAME}$`, 'i'), 'RUSHING_RECEIVING_YARDS'],
  [new RegExp(`^Total Rushing Yards by the Player${FULL_GAME}$`, 'i'), 'RUSHING_YARDS'],
  [new RegExp(`^Total Receiving Yards by the Player${FULL_GAME}$`, 'i'), 'RECEIVING_YARDS'],
  [new RegExp(`^Total Passing Yards by the Player${FULL_GAME}$`, 'i'), 'PASSING_YARDS'],
  [new RegExp(`^Total Receptions by the Player${FULL_GAME}$`, 'i'), 'RECEPTIONS'],
  [new RegExp(`^Total Touchdown Passes Thrown by the Player${FULL_GAME}$`, 'i'), 'PASSING_TDS'],
  [new RegExp(`^Total Pass Completions by the Player${FULL_GAME}$`, 'i'), 'PASS_COMPLETIONS'],
  [new RegExp(`^Total ${PASS_ATTEMPTS}${FULL_GAME}$`, 'i'), 'PASS_ATTEMPTS'],
];

const TD_SCORER = /^Touchdown Scorer$/i;

/** "Player to have at least 0.5 Sacks - Including Overtime" + Yes → SACKS ≥ 0.5 (i.e. any sack). */
const AT_LEAST_MARKETS: Array<[RegExp, StatKey]> = [
  [new RegExp(`^Player to have at least (\\d+(?:\\.\\d+)?) Sacks?${FULL_GAME}$`, 'i'), 'SACKS'],
];

/**
 * Whole-game totals with no player ("Total Successful Field Goals" Over 3.5),
 * summed across both teams. ESPN can't separate overtime, so these count the
 * full game.
 */
const GAME_OVER_UNDER_MARKETS: Array<[RegExp, StatKey]> = [
  [new RegExp(`^Total Successful Field Goals${FULL_GAME}$`, 'i'), 'FIELD_GOALS_MADE'],
];

export function classifyMarket(m: MarketInput): Classification {
  if (!m.sport || !FOOTBALL_SPORTS.has(m.sport)) return { supported: false, reason: 'UNSUPPORTED_SPORT' };
  const name = m.marketName?.trim() ?? '';

  if (TD_SCORER.test(name)) {
    // Kambi sends line 1 for anytime TD; a higher line would be "2+ TDs".
    const target = m.line ?? 1;
    if (m.selectionSide === 'NO') return { supported: true, scope: 'PLAYER', metric: 'TOUCHDOWNS', operator: 'LT', target, display: 'BINARY' };
    if (m.selectionSide !== 'YES' && m.selectionSide !== null) return { supported: false, reason: 'UNSUPPORTED_SIDE' };
    return { supported: true, scope: 'PLAYER', metric: 'TOUCHDOWNS', operator: 'GTE', target, display: target === 1 ? 'BINARY' : 'PROGRESS' };
  }

  for (const [re, metric] of THRESHOLD_MARKETS) {
    const hit = re.exec(name);
    if (!hit) continue;
    const fromName = Number(hit[1]);
    // Kambi also sends the threshold as the line; if they disagree, don't guess.
    if (m.line !== null && m.line !== fromName) return { supported: false, reason: 'LINE_MISMATCH' };
    if (m.selectionSide === 'YES') return { supported: true, scope: 'PLAYER', metric, operator: 'GTE', target: fromName, display: 'PROGRESS' };
    if (m.selectionSide === 'NO') return { supported: true, scope: 'PLAYER', metric, operator: 'LT', target: fromName, display: 'PROGRESS' };
    return { supported: false, reason: 'UNSUPPORTED_SIDE' };
  }

  for (const [re, metric] of OVER_UNDER_MARKETS) {
    if (!re.test(name)) continue;
    if (m.line === null) return { supported: false, reason: 'MISSING_LINE' };
    if (m.selectionSide === 'OVER') return { supported: true, scope: 'PLAYER', metric, operator: 'GT', target: m.line, display: 'PROGRESS' };
    if (m.selectionSide === 'UNDER') return { supported: true, scope: 'PLAYER', metric, operator: 'LT', target: m.line, display: 'PROGRESS' };
    return { supported: false, reason: 'UNSUPPORTED_SIDE' };
  }

  for (const [re, metric] of AT_LEAST_MARKETS) {
    const hit = re.exec(name);
    if (!hit) continue;
    const fromName = Number(hit[1]);
    if (m.line !== null && m.line !== fromName) return { supported: false, reason: 'LINE_MISMATCH' };
    // "at least 0.5" = at least one: a ✓/○ pick rather than a bar.
    const display = fromName <= 1 ? 'BINARY' : 'PROGRESS';
    if (m.selectionSide === 'YES') return { supported: true, scope: 'PLAYER', metric, operator: 'GTE', target: fromName, display };
    if (m.selectionSide === 'NO') return { supported: true, scope: 'PLAYER', metric, operator: 'LT', target: fromName, display };
    return { supported: false, reason: 'UNSUPPORTED_SIDE' };
  }

  for (const [re, metric] of GAME_OVER_UNDER_MARKETS) {
    if (!re.test(name)) continue;
    if (m.line === null) return { supported: false, reason: 'MISSING_LINE' };
    if (m.selectionSide === 'OVER') return { supported: true, scope: 'GAME', metric, operator: 'GT', target: m.line, display: 'PROGRESS' };
    if (m.selectionSide === 'UNDER') return { supported: true, scope: 'GAME', metric, operator: 'LT', target: m.line, display: 'PROGRESS' };
    return { supported: false, reason: 'UNSUPPORTED_SIDE' };
  }

  return { supported: false, reason: 'UNSUPPORTED_MARKET' };
}

/**
 * Markets decided by the game result rather than a stat. They have no
 * progress bar; the UI shows the live game (score, clock, possession) instead.
 * Full-game moneylines and point spreads; halves and quarters aren't tracked.
 */
export type GameMarket = 'MONEYLINE' | 'SPREAD';

export function gameMarket(marketName: string | null): GameMarket | null {
  const name = marketName?.trim() ?? '';
  if (/^Moneyline(?: - Including Overtime)?$/i.test(name)) return 'MONEYLINE';
  if (/^Point Spread(?: - Including Overtime)?$/i.test(name)) return 'SPREAD';
  return null;
}

/**
 * A spread pick's team and line. Island Luck's coupon names the pick with its
 * line ("LV Raiders +5.0"), which team matching can't read, so it is split off;
 * the outcome's own line wins when there is one.
 */
export function spreadPick(name: string | null, line: number | null): { team: string | null; line: number | null } {
  const m = /^(.+?)\s+([+-]\d+(?:\.\d+)?|0(?:\.0)?)$/.exec(name?.trim() ?? '');
  if (!m) return { team: name, line };
  return { team: m[1]!, line: line ?? Number(m[2]) };
}
