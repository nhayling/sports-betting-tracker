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
};
export const metricUnit = (m: string | null) => (m ? (METRIC_UNITS[m] ?? '') : '');

/** "80+ Rushing Yards By The Player - Including Overtime" → "80+ rushing yards". */
export function marketLabel(marketName: string | null, selectionLabel: string | null, side: string | null): string {
  if (!marketName) return selectionLabel ?? '';
  if (/^Touchdown Scorer$/i.test(marketName)) return side === 'NO' ? 'No touchdown' : 'Anytime TD';
  if (/^Moneyline/i.test(marketName)) return 'Moneyline';
  const sacks = /^Player to have at least ([\d.]+) Sacks?/i.exec(marketName);
  if (sacks) return Number(sacks[1]) <= 1 ? (side === 'NO' ? 'No sack' : 'To record a sack') : `${side === 'NO' ? 'Under ' : ''}${sacks[1]}+ sacks`;
  if (/^Total Successful Field Goals/i.test(marketName)) return 'Total field goals (both teams)';
  // Pass attempts is the one player market Kambi names without "By The Player".
  const plus = /^(\d+\+) (.+?) By The Player/i.exec(marketName) ?? /^(\d+\+) (Pass Attempts)$/i.exec(marketName);
  if (plus) return `${side === 'NO' ? 'Under ' : ''}${plus[1]} ${plus[2]!.toLowerCase()}`;
  const total = /^Total (.+?) by the Player/i.exec(marketName) ?? /^Total (Pass Attempts)$/i.exec(marketName);
  if (total) {
    const ou = / - (Over|Under) ([\d.]+)$/.exec(selectionLabel ?? '');
    return `${ou ? `${ou[1]} ${ou[2]} ` : ''}${total[1]!.toLowerCase()}`;
  }
  return marketName.replace(/ - Including Overtime$/i, '');
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
  return { hit: 'Scored', pending: 'Not yet', missed: 'Did not score' };
}

export * from './standing';
