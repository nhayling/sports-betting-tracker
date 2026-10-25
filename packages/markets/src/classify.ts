import type { StatKey } from '@sports-better/sports-data';
import { isFightMarket } from './fight';

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

const FULL_GAME = '(?: - Including Overtime)?';

const RUSH_REC = 'Rushing (?:&|and) Receiving Yards';
/**
 * Kambi names this one "25+ Pass Attempts" / "Total Pass Attempts", with no
 * "By The Player" and no overtime suffix. ESPN can't separate overtime, so it
 * counts the full game like every other stat.
 */
const PASS_ATTEMPTS = 'Pass Attempts(?: By The Player)?';

/** One sport's market names, by shape. Each regex is the whole Kambi criterion label. */
interface SportMarkets {
  /** "80+ Rushing Yards By The Player - Including Overtime" + Yes → RUSHING_YARDS ≥ 80. The number is group 1. */
  threshold: Array<[RegExp, StatKey]>;
  /** "Total Receiving Yards by the Player - Including Overtime" + Over 38.5 → RECEIVING_YARDS > 38.5 */
  overUnder: Array<[RegExp, StatKey]>;
  /** "Player to have at least 0.5 Sacks" + Yes → SACKS ≥ 0.5 (any sack). The number is group 1. */
  atLeast: Array<[RegExp, StatKey]>;
  /** Yes/no with the target in the table: "To record a double-double" + Yes → DOUBLE_DOUBLE ≥ 1, "To score" → GOALS ≥ 1. */
  yesNo: Array<[RegExp, StatKey, number]>;
  /**
   * Whole-game totals with no player ("Total Successful Field Goals" Over 3.5),
   * summed across both teams. ESPN can't separate overtime, so these count the
   * full game.
   */
  gameOverUnder: Array<[RegExp, StatKey]>;
  /** Football's "Touchdown Scorer". */
  touchdownScorer: boolean;
}

const FOOTBALL: SportMarkets = {
  threshold: [
    [new RegExp(`^(\\d+)\\+ ${RUSH_REC} By The Player${FULL_GAME}$`, 'i'), 'RUSHING_RECEIVING_YARDS'],
    [new RegExp(`^(\\d+)\\+ Rushing Yards By The Player${FULL_GAME}$`, 'i'), 'RUSHING_YARDS'],
    [new RegExp(`^(\\d+)\\+ Receiving Yards By The Player${FULL_GAME}$`, 'i'), 'RECEIVING_YARDS'],
    [new RegExp(`^(\\d+)\\+ Passing Yards By The Player${FULL_GAME}$`, 'i'), 'PASSING_YARDS'],
    [new RegExp(`^(\\d+)\\+ Receptions By The Player${FULL_GAME}$`, 'i'), 'RECEPTIONS'],
    [new RegExp(`^(\\d+)\\+ Touchdown Passes By The Player${FULL_GAME}$`, 'i'), 'PASSING_TDS'],
    [new RegExp(`^(\\d+)\\+ Pass Completions By The Player${FULL_GAME}$`, 'i'), 'PASS_COMPLETIONS'],
    [new RegExp(`^(\\d+)\\+ ${PASS_ATTEMPTS}${FULL_GAME}$`, 'i'), 'PASS_ATTEMPTS'],
    // "2+ Touchdown To Be Scored By The Player": rushing, receiving and return TDs, as "Touchdown Scorer" counts them.
    [new RegExp(`^(\\d+)\\+ Touchdowns? To Be Scored By The Player${FULL_GAME}$`, 'i'), 'TOUCHDOWNS'],
    [new RegExp(`^(\\d+)\\+ Interceptions Thrown By The Player${FULL_GAME}$`, 'i'), 'INTERCEPTIONS_THROWN'],
  ],
  overUnder: [
    [new RegExp(`^Total ${RUSH_REC} by the Player${FULL_GAME}$`, 'i'), 'RUSHING_RECEIVING_YARDS'],
    [new RegExp(`^Total Rushing Yards by the Player${FULL_GAME}$`, 'i'), 'RUSHING_YARDS'],
    [new RegExp(`^Total Receiving Yards by the Player${FULL_GAME}$`, 'i'), 'RECEIVING_YARDS'],
    [new RegExp(`^Total Passing Yards by the Player${FULL_GAME}$`, 'i'), 'PASSING_YARDS'],
    [new RegExp(`^Total Receptions by the Player${FULL_GAME}$`, 'i'), 'RECEPTIONS'],
    [new RegExp(`^Total Touchdown Passes Thrown by the Player${FULL_GAME}$`, 'i'), 'PASSING_TDS'],
    [new RegExp(`^Total Pass Completions by the Player${FULL_GAME}$`, 'i'), 'PASS_COMPLETIONS'],
    [new RegExp(`^Total ${PASS_ATTEMPTS}${FULL_GAME}$`, 'i'), 'PASS_ATTEMPTS'],
  ],
  atLeast: [[new RegExp(`^Player to have at least (\\d+(?:\\.\\d+)?) Sacks?${FULL_GAME}$`, 'i'), 'SACKS']],
  yesNo: [],
  gameOverUnder: [[new RegExp(`^Total Successful Field Goals${FULL_GAME}$`, 'i'), 'FIELD_GOALS_MADE']],
  touchdownScorer: true,
};

/**
 * Kambi's NBA player props, as the offering feed names them. "N+" props say
 * "By The Player"; over/unders say "by the player" with their own wording
 * ("Points scored", "3-point field goals made").
 */
const BASKETBALL_PROPS: Array<{ threshold: string; overUnder: string; metric: StatKey }> = [
  { threshold: 'Points Scored', overUnder: 'Points scored', metric: 'POINTS' },
  { threshold: 'Rebounds', overUnder: 'Rebounds', metric: 'REBOUNDS' },
  { threshold: 'Assists', overUnder: 'Assists', metric: 'ASSISTS' },
  { threshold: 'Three-Point Field Goals Made', overUnder: '3-point field goals made', metric: 'THREES_MADE' },
  { threshold: 'Steals', overUnder: 'Steals', metric: 'STEALS' },
  { threshold: 'Blocks', overUnder: 'Blocks', metric: 'BLOCKS' },
  { threshold: 'Points & Rebounds', overUnder: 'Points & Rebounds', metric: 'POINTS_REBOUNDS' },
  { threshold: 'Points & Assists', overUnder: 'Points & Assists', metric: 'POINTS_ASSISTS' },
  { threshold: 'Rebounds & Assists', overUnder: 'Rebounds & Assists', metric: 'REBOUNDS_ASSISTS' },
  { threshold: 'Points, Rebounds & Assists', overUnder: 'Points, rebounds & assists', metric: 'POINTS_REBOUNDS_ASSISTS' },
  { threshold: 'Steals & Blocks', overUnder: 'Steals & Blocks', metric: 'STEALS_BLOCKS' },
];

const BASKETBALL: SportMarkets = {
  threshold: BASKETBALL_PROPS.map(({ threshold, metric }) => [new RegExp(`^(\\d+)\\+ ${threshold} By The Player${FULL_GAME}$`, 'i'), metric]),
  overUnder: BASKETBALL_PROPS.map(({ overUnder, metric }) => [new RegExp(`^${overUnder} by the player${FULL_GAME}$`, 'i'), metric]),
  atLeast: [],
  yesNo: [
    [new RegExp(`^To record a double-double${FULL_GAME}$`, 'i'), 'DOUBLE_DOUBLE', 1],
    [new RegExp(`^To record a triple-double${FULL_GAME}$`, 'i'), 'TRIPLE_DOUBLE', 1],
  ],
  gameOverUnder: [
    [new RegExp(`^Total Match Assists${FULL_GAME}$`, 'i'), 'ASSISTS'],
    [new RegExp(`^Total Match made Threes${FULL_GAME}$`, 'i'), 'THREES_MADE'],
    // WNBA.
    [new RegExp(`^Total Match Steals${FULL_GAME}$`, 'i'), 'STEALS'],
  ],
  touchdownScorer: false,
};

/**
 * Kambi's MLB props all end "- Including Extra Innings (Listed player must be
 * in starting lineup for bets to stand)". Doubles, total bases and stolen
 * bases aren't in ESPN's box score, so those aren't tracked.
 */
const EXTRA_INNINGS = '(?: - Including Extra Innings)?(?: \\(Listed player must be in starting lineup for bets to stand\\))?';

const BASEBALL: SportMarkets = {
  threshold: [
    [new RegExp(`^(\\d+)\\+ Hits by the Player${EXTRA_INNINGS}$`, 'i'), 'HITS'],
    [new RegExp(`^(\\d+)\\+ RBIs by the Player${EXTRA_INNINGS}$`, 'i'), 'RBIS'],
    [new RegExp(`^(\\d+)\\+ Runs Scored by the Player${EXTRA_INNINGS}$`, 'i'), 'RUNS'],
    [new RegExp(`^(\\d+)\\+ Hits, Runs & RBIs Recorded by the Player${EXTRA_INNINGS}$`, 'i'), 'HITS_RUNS_RBIS'],
    [new RegExp(`^(\\d+)\\+ Strikeouts thrown by the Player${EXTRA_INNINGS}$`, 'i'), 'PITCHER_STRIKEOUTS'],
  ],
  overUnder: [
    [new RegExp(`^Total Hits by the Player${EXTRA_INNINGS}$`, 'i'), 'HITS'],
    [new RegExp(`^Total RBI by the Player${EXTRA_INNINGS}$`, 'i'), 'RBIS'],
    // A pitcher's strikeouts; Kambi has no batter strikeout prop.
    [new RegExp(`^Total Strikeouts by the Player${EXTRA_INNINGS}$`, 'i'), 'PITCHER_STRIKEOUTS'],
    [new RegExp(`^Total Outs Recorded by the Player${EXTRA_INNINGS}$`, 'i'), 'OUTS_RECORDED'],
  ],
  atLeast: [],
  yesNo: [
    [new RegExp(`^Player to Hit a Home Run${EXTRA_INNINGS}$`, 'i'), 'HOME_RUNS', 1],
    [new RegExp(`^Player to hit 2 or more Home Runs${EXTRA_INNINGS}$`, 'i'), 'HOME_RUNS', 2],
  ],
  gameOverUnder: [],
  touchdownScorer: false,
};

/** NHL props count overtime but not the shootout, as ESPN's goals do. Power-play points aren't in ESPN's box score. */
const ICE_HOCKEY: SportMarkets = {
  threshold: [],
  overUnder: [[new RegExp(`^Player's shots on goal${FULL_GAME}$`, 'i'), 'SHOTS_ON_GOAL']],
  atLeast: [
    [new RegExp(`^To score at least (\\d+) goals${FULL_GAME}$`, 'i'), 'GOALS'],
    [new RegExp(`^Player to record at least (\\d+) assists${FULL_GAME}$`, 'i'), 'ASSISTS'],
    [new RegExp(`^Player to score at least (\\d+) points${FULL_GAME}$`, 'i'), 'POINTS'],
  ],
  yesNo: [[new RegExp(`^To score${FULL_GAME}$`, 'i'), 'GOALS', 1]],
  gameOverUnder: [[new RegExp(`^Total Shots on Goal${FULL_GAME}$`, 'i'), 'SHOTS_ON_GOAL']],
  touchdownScorer: false,
};

/** Soccer (Kambi's FOOTBALL): 90 minutes plus stoppage time, as ESPN counts league matches. */
const SOCCER: SportMarkets = {
  threshold: [],
  overUnder: [],
  atLeast: [[/^To score at least (\d+) goals$/i, 'GOALS']],
  yesNo: [
    [/^To Score$/i, 'GOALS', 1],
    [/^To Get a Card$/i, 'CARDS', 1],
    [/^To Get a Red Card$/i, 'RED_CARDS', 1],
  ],
  gameOverUnder: [[/^Total Corners$/i, 'CORNERS']],
  touchdownScorer: false,
};

/** UFC has no stat props; its markets are graded from the result (see fight.ts). */
const MARTIAL_ARTS: SportMarkets = { threshold: [], overUnder: [], atLeast: [], yesNo: [], gameOverUnder: [], touchdownScorer: false };

/** Kambi sport → its markets. Kambi calls soccer FOOTBALL. */
const MARKETS: Record<string, SportMarkets> = { AMERICAN_FOOTBALL: FOOTBALL, BASKETBALL, BASEBALL, ICE_HOCKEY, FOOTBALL: SOCCER, MARTIAL_ARTS };

const TD_SCORER = /^Touchdown Scorer$/i;

export function classifyMarket(m: MarketInput): Classification {
  const markets = m.sport ? MARKETS[m.sport] : undefined;
  if (!markets) return { supported: false, reason: 'UNSUPPORTED_SPORT' };
  const name = m.marketName?.trim() ?? '';

  if (markets.touchdownScorer && TD_SCORER.test(name)) {
    // Kambi sends line 1 for anytime TD; a higher line would be "2+ TDs".
    const target = m.line ?? 1;
    if (m.selectionSide === 'NO') return { supported: true, scope: 'PLAYER', metric: 'TOUCHDOWNS', operator: 'LT', target, display: 'BINARY' };
    if (m.selectionSide !== 'YES' && m.selectionSide !== null) return { supported: false, reason: 'UNSUPPORTED_SIDE' };
    return { supported: true, scope: 'PLAYER', metric: 'TOUCHDOWNS', operator: 'GTE', target, display: target === 1 ? 'BINARY' : 'PROGRESS' };
  }

  for (const [re, metric] of markets.threshold) {
    const hit = re.exec(name);
    if (!hit) continue;
    const fromName = Number(hit[1]);
    // Kambi also sends the threshold as the line; if they disagree, don't guess.
    if (m.line !== null && m.line !== fromName) return { supported: false, reason: 'LINE_MISMATCH' };
    if (m.selectionSide === 'YES') return { supported: true, scope: 'PLAYER', metric, operator: 'GTE', target: fromName, display: 'PROGRESS' };
    if (m.selectionSide === 'NO') return { supported: true, scope: 'PLAYER', metric, operator: 'LT', target: fromName, display: 'PROGRESS' };
    return { supported: false, reason: 'UNSUPPORTED_SIDE' };
  }

  for (const [re, metric] of markets.overUnder) {
    if (!re.test(name)) continue;
    if (m.line === null) return { supported: false, reason: 'MISSING_LINE' };
    if (m.selectionSide === 'OVER') return { supported: true, scope: 'PLAYER', metric, operator: 'GT', target: m.line, display: 'PROGRESS' };
    if (m.selectionSide === 'UNDER') return { supported: true, scope: 'PLAYER', metric, operator: 'LT', target: m.line, display: 'PROGRESS' };
    return { supported: false, reason: 'UNSUPPORTED_SIDE' };
  }

  for (const [re, metric] of markets.atLeast) {
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

  for (const [re, metric, target] of markets.yesNo) {
    if (!re.test(name)) continue;
    // The target is in the name; Kambi's line on these (2 for a double-double) can mean something else.
    const display = target === 1 ? 'BINARY' : 'PROGRESS';
    if (m.selectionSide === 'YES') return { supported: true, scope: 'PLAYER', metric, operator: 'GTE', target, display };
    if (m.selectionSide === 'NO') return { supported: true, scope: 'PLAYER', metric, operator: 'LT', target, display };
    return { supported: false, reason: 'UNSUPPORTED_SIDE' };
  }

  for (const [re, metric] of markets.gameOverUnder) {
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
 * progress bar; the UI shows the live game (score, clock) instead. Full-game
 * lines only: halves, quarters, periods and innings aren't tracked.
 *
 * MONEYLINE, SPREAD, TOTAL: two-way, every sport (NHL's count overtime and the
 * shootout, as Island Luck's "Inc. OT and Shootout" ones do). TEAM_TOTAL: one
 * team's points, runs or goals ("Total Points by SF 49ers"). RESULT: soccer's
 * three-way "Full Time" (home, draw, away). BTTS: both teams to score. FIGHT:
 * UFC, graded from how the bout ended (see fight.ts).
 */
export type GameMarket = 'MONEYLINE' | 'SPREAD' | 'TOTAL' | 'TEAM_TOTAL' | 'RESULT' | 'BTTS' | 'FIGHT';

const WHOLE_GAME = '(?: - (?:Including Overtime|Inc\\. OT and Shootout))?';

export function gameMarket(marketName: string | null): GameMarket | null {
  const name = marketName?.trim() ?? '';
  if (new RegExp(`^Moneyline${WHOLE_GAME}$`, 'i').test(name)) return 'MONEYLINE';
  // NFL/NBA "Point Spread", MLB "Run Line", NHL "Puck Line", soccer "Spread".
  if (new RegExp(`^(?:Point Spread|Run Line|Puck Line|Spread)${WHOLE_GAME}$`, 'i').test(name)) return 'SPREAD';
  if (new RegExp(`^(?:Total Points|Total Runs|Total Goals)${WHOLE_GAME}$`, 'i').test(name)) return 'TOTAL';
  if (teamTotalTeam(name)) return 'TEAM_TOTAL';
  if (/^Full Time$/i.test(name)) return 'RESULT';
  if (new RegExp(`^Both Teams To Score${WHOLE_GAME}$`, 'i').test(name)) return 'BTTS';
  if (isFightMarket(name)) return 'FIGHT';
  return null;
}

/** The team in a full-game team total: "Total Points by SF 49ers" → "SF 49ers". Null for halves, periods and the rest. */
export function teamTotalTeam(marketName: string | null): string | null {
  // The team can't contain " - ", which starts a period suffix ("- 1st Half"); a hyphen alone is fine (Saint-Germain).
  const m = new RegExp(`^Total (?:Points|Runs|Goals) by ((?:(?! - ).)+?)${WHOLE_GAME}$`, 'i').exec(marketName?.trim() ?? '');
  return m ? m[1]!.trim() : null;
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
