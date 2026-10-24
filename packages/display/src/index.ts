/**
 * Display rules shared by the web app and server-generated text
 * (notifications): American odds, Nassau local time, "picks" not "legs".
 * See docs/PLAN.md → UI rules. Storage is cents / Kambi ×1000 odds / UTC.
 */

const TZ = 'America/Nassau';

export function money(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100);
}

/** Kambi odds ×1000 → American ("+1187", "-244"). */
export function americanOdds(raw: number | null | undefined): string {
  if (!raw || raw <= 1000) return '—';
  const d = raw / 1000;
  const a = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
  return a > 0 ? `+${a}` : String(a);
}

/** Leaderboard units, where every bet is one unit: 3 → "+3.00u", −8.05 → "−8.05u". */
export function units(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}u`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'short' });
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);
  if (today.format(d) === today.format(new Date())) return `Today ${time}`;
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'numeric', day: 'numeric' }).format(d);
  return `${day} ${time}`;
}

export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
}

export function quarter(period: number | null): string {
  if (!period) return '';
  return period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `${period - 4}OT`;
}

const METRIC_UNITS: Record<string, string> = {
  RUSHING_YARDS: 'rush yds',
  RECEIVING_YARDS: 'rec yds',
  RUSHING_RECEIVING_YARDS: 'rush+rec yds',
  SACKS: 'sacks',
  FIELD_GOALS_MADE: 'FG',
  PASSING_YARDS: 'pass yds',
  PASS_COMPLETIONS: 'pass comp',
  PASS_ATTEMPTS: 'pass att',
  RECEPTIONS: 'rec',
  PASSING_TDS: 'pass TD',
  TOUCHDOWNS: 'TD',
  POINTS: 'pts',
  REBOUNDS: 'reb',
  ASSISTS: 'ast',
  STEALS: 'stl',
  BLOCKS: 'blk',
  THREES_MADE: 'threes',
  POINTS_REBOUNDS: 'pts+reb',
  POINTS_ASSISTS: 'pts+ast',
  REBOUNDS_ASSISTS: 'reb+ast',
  POINTS_REBOUNDS_ASSISTS: 'pts+reb+ast',
  STEALS_BLOCKS: 'stl+blk',
  DOUBLE_DOUBLE: 'double-double',
  TRIPLE_DOUBLE: 'triple-double',
  HITS: 'hits',
  RUNS: 'runs',
  RBIS: 'RBIs',
  HOME_RUNS: 'HR',
  HITS_RUNS_RBIS: 'H+R+RBI',
  PITCHER_STRIKEOUTS: 'K',
  OUTS_RECORDED: 'outs',
  GOALS: 'goals',
  SHOTS_ON_GOAL: 'SOG',
  SHOTS_ON_TARGET: 'on target',
  SHOTS: 'shots',
  CARDS: 'cards',
  RED_CARDS: 'red cards',
  CORNERS: 'corners',
};
export const metricUnit = (m: string | null) => (m ? (METRIC_UNITS[m] ?? '') : '');

/** "80+ Rushing Yards By The Player - Including Overtime" → "80+ rushing yards". */
export function marketLabel(marketName: string | null, selectionLabel: string | null, side: string | null): string {
  if (!marketName) return selectionLabel ?? '';
  const no = side === 'NO';
  if (/^Touchdown Scorer$/i.test(marketName)) return no ? 'No touchdown' : 'Anytime TD';
  if (/^Moneyline/i.test(marketName)) return 'Moneyline';
  if (/^Point Spread/i.test(marketName)) return 'Point spread';
  if (/^Run Line$/i.test(marketName)) return 'Run line';
  if (/^Puck Line/i.test(marketName)) return 'Puck line';
  if (/^Spread$/i.test(marketName)) return 'Spread';
  if (/^Total Points(?: - Including Overtime)?$/i.test(marketName)) return 'Total points';
  if (/^Total Runs$/i.test(marketName)) return 'Total runs';
  if (/^Total Goals(?: - Inc\. OT and Shootout)?$/i.test(marketName)) return 'Total goals';
  if (/^Full Time$/i.test(marketName)) return 'Match result';
  if (/^Both Teams To Score/i.test(marketName)) return no ? 'No' : 'Yes';
  const fight = fightLabel(marketName, selectionLabel, no);
  if (fight) return fight;
  // MLB, NHL and soccer yes/no props.
  if (/^Player to Hit a Home Run/i.test(marketName)) return no ? 'No home run' : 'To hit a home run';
  if (/^Player to hit 2 or more Home Runs/i.test(marketName)) return `${no ? 'Under ' : ''}2+ home runs`;
  if (/^To score(?: - Including Overtime)?$/i.test(marketName)) return no ? 'No goal' : 'Anytime goal';
  const atLeast = /^(?:To score|Player to record|Player to score) at least (\d+) (goals|assists|points)/i.exec(marketName);
  if (atLeast) return `${no ? 'Under ' : ''}${atLeast[1]}+ ${atLeast[2]!.toLowerCase()}`;
  if (/^To Get a Card$/i.test(marketName)) return no ? 'No card' : 'To be carded';
  if (/^To Get a Red Card$/i.test(marketName)) return no ? 'No red card' : 'To be sent off';
  if (/^Total Corners$/i.test(marketName)) return 'Total corners (both teams)';
  if (/^Total Shots on Goal/i.test(marketName)) return 'Total shots on goal (both teams)';
  if (/^Total Match Steals/i.test(marketName)) return 'Total steals (both teams)';
  if (/^Player's shots on goal/i.test(marketName)) {
    const ou = / - (Over|Under) ([\d.]+)$/.exec(selectionLabel ?? '');
    return `${ou ? `${ou[1]} ${ou[2]} ` : ''}shots on goal`;
  }
  const sacks = /^Player to have at least ([\d.]+) Sacks?/i.exec(marketName);
  if (sacks) return Number(sacks[1]) <= 1 ? (side === 'NO' ? 'No sack' : 'To record a sack') : `${side === 'NO' ? 'Under ' : ''}${sacks[1]}+ sacks`;
  if (/^Total Successful Field Goals/i.test(marketName)) return 'Total field goals (both teams)';
  const multiple = /^To record a (double|triple)-double/i.exec(marketName);
  if (multiple) return `${side === 'NO' ? 'No ' : 'To record a '}${multiple[1]!.toLowerCase()}-double`;
  if (/^Total Match Assists/i.test(marketName)) return 'Total assists (both teams)';
  if (/^Total Match made Threes/i.test(marketName)) return 'Total threes (both teams)';
  // Pass attempts is the one player market Kambi names without "By The Player".
  const plus = /^(\d+\+) (.+?) By The Player/i.exec(marketName) ?? /^(\d+\+) (Pass Attempts)$/i.exec(marketName);
  if (plus) return `${side === 'NO' ? 'Under ' : ''}${plus[1]} ${statWords(plus[2]!)}`;
  // Football says "Total Receptions by the Player"; basketball "Points scored by the player".
  const total = /^Total (.+?) by the Player/i.exec(marketName) ?? /^Total (Pass Attempts)$/i.exec(marketName) ?? /^(.+?) by the player/i.exec(marketName);
  if (total) {
    const ou = / - (Over|Under) ([\d.]+)$/.exec(selectionLabel ?? '');
    return `${ou ? `${ou[1]} ${ou[2]} ` : ''}${statWords(total[1]!)}`;
  }
  return marketName.replace(/ - Including Overtime$/i, '');
}

/** A market's stat, in the words a bettor uses: "Points Scored" → "points", "3-point field goals made" → "threes". */
function statWords(stat: string): string {
  return stat
    .toLowerCase()
    .replace(/^points scored$/, 'points')
    .replace(/^(three-point|3-point) field goals made$/, 'threes')
    .replace(/^runs scored$/, 'runs')
    .replace(/^rbis?$/, 'RBIs')
    .replace(/^hits, runs & rbis recorded$/, 'hits + runs + RBIs')
    .replace(/^strikeouts thrown$/, 'strikeouts');
}

/** UFC markets, without the fighter (the pick's name says who): "Kody Steele to win by Decision" → "To win by decision". */
function fightLabel(marketName: string, selectionLabel: string | null, no: boolean): string | null {
  if (/^Bout Odds$/i.test(marketName)) return 'To win';
  if (/^Total Rounds$/i.test(marketName)) return `${selectionLabel ?? ''} rounds`.trim();
  if (/^To go the distance$/i.test(marketName)) return no ? 'Doesn’t go the distance' : 'Goes the distance';
  let m = /^.+ to win by (Decision|Finish)$/i.exec(marketName);
  if (m) return `${no ? 'Not to win' : 'To win'} by ${m[1]!.toLowerCase()}`;
  m = /^Any Fighter to win by (KO, TKO or DQ|Submission)$/i.exec(marketName);
  if (m) return `${no ? 'No' : 'Ends by'} ${/submission/i.test(m[1]!) ? 'submission' : 'KO, TKO or DQ'}`;
  m = /^.+ to Win & (Over|Under) ([\d.]+) Rounds$/i.exec(marketName);
  if (m) return `${no ? 'Not to win' : 'To win'}, ${m[1]!.toLowerCase()} ${m[2]} rounds`;
  m = /^Fight to start Round (\d+)$/i.exec(marketName);
  if (m) return `Round ${m[1]} ${no ? 'doesn’t start' : 'starts'}`;
  m = /^Any Fighter to win in Round (\d+)$/i.exec(marketName);
  if (m) return `${no ? 'No finish' : 'Finish'} in round ${m[1]}`;
  return null;
}

export const REWARD_LABELS: Record<string, string> = {
  FREE_BET: 'Free bet',
  INSURANCE: 'Insurance',
  SECOND_CHANCE: 'Second chance',
};

export const UNAVAILABLE_REASONS: Record<string, string> = {
  UNSUPPORTED_MARKET: 'Market not tracked',
  UNSUPPORTED_SPORT: 'Sport not tracked',
  UNSUPPORTED_LEAGUE: 'League not tracked',
  UNSUPPORTED_SIDE: 'Market not tracked',
  LINE_MISMATCH: 'Line unclear',
  MISSING_LINE: 'Line unclear',
  EVENT_NOT_MATCHED: 'Game not found',
  PLAYER_NEEDS_REVIEW: 'Player match needs review',
  PLAYER_REJECTED: 'Player not linked',
  PLAYER_NOT_FOUND: 'Player not found',
  NO_PARTICIPANT: 'No player',
  PROVIDER_ERROR: 'Stats temporarily unavailable',
  NO_STAT: 'Stat not available',
};

/** "just now", "12 min ago", "2 h ago", "yesterday", or a date. */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return dateTime(iso);
}

/** ✓/○ wording for binary picks, by stat. */
export function binaryWords(metric: string | null): { hit: string; pending: string; missed: string } {
  if (metric === 'SACKS') return { hit: 'Sack', pending: 'No sack yet', missed: 'No sack' };
  if (metric === 'DOUBLE_DOUBLE') return { hit: 'Double-double', pending: 'Not yet', missed: 'No double-double' };
  if (metric === 'TRIPLE_DOUBLE') return { hit: 'Triple-double', pending: 'Not yet', missed: 'No triple-double' };
  if (metric === 'HOME_RUNS') return { hit: 'Homered', pending: 'Not yet', missed: 'No home run' };
  if (metric === 'CARDS') return { hit: 'Carded', pending: 'No card yet', missed: 'No card' };
  if (metric === 'RED_CARDS') return { hit: 'Sent off', pending: 'Not yet', missed: 'No red card' };
  if (metric === 'ASSISTS') return { hit: 'Assist', pending: 'Not yet', missed: 'No assist' };
  if (metric === 'POINTS') return { hit: 'Point', pending: 'Not yet', missed: 'No point' };
  return { hit: 'Scored', pending: 'Not yet', missed: 'Did not score' };
}

export * from './standing';
