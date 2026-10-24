import { SPORT_KIND, type ProviderEvent, type ProviderTeam, type Sport } from '@sports-better/sports-data';
import { normalizePersonName, normalizeText, stripRanking } from './normalize';

/**
 * Links a Kambi event to a provider event. NFL team names differ between the
 * two ("WAS Commanders" vs WSH/"Commanders"), so NFL matches on nickname,
 * which is unique across the league. The NBA, WNBA, MLB and NHL do too, with
 * nicknames of more than one word ("POR Trail Blazers", "TOR Maple Leafs").
 * College matches on location after stripping rankings ("(1) Texas" → ESPN
 * location "Texas"). Soccer clubs match when one name's words contain the
 * other's ("Brighton" → "Brighton & Hove Albion"), and UFC bouts on the two
 * fighters' names.
 */

export interface SportsbookEvent {
  sport: Sport;
  homeName: string;
  awayName: string;
  startAt: string;
}

export type MatchMethod = 'NFL_NICKNAME' | 'NICKNAME' | 'NCAAF_LOCATION' | 'CLUB_NAME' | 'FIGHTER_NAME';

export type EventMatch =
  | { ok: true; event: ProviderEvent; confidence: number; method: MatchMethod; swapped: boolean }
  | { ok: false; reason: 'NO_CANDIDATE' | 'AMBIGUOUS'; candidates: ProviderEvent[] };

const MAX_START_DIFF_MS = 3 * 60 * 60 * 1000;
/** ESPN dates every bout at the card's start; Kambi estimates each bout's own time, hours later for the main event. */
const MAX_FIGHT_START_DIFF_MS = 12 * 60 * 60 * 1000;
const METHODS: Record<Sport, MatchMethod> = {
  NFL: 'NFL_NICKNAME',
  NCAAF: 'NCAAF_LOCATION',
  NBA: 'NICKNAME',
  WNBA: 'NICKNAME',
  MLB: 'NICKNAME',
  NHL: 'NICKNAME',
  EPL: 'CLUB_NAME',
  LALIGA: 'CLUB_NAME',
  UFC: 'FIGHTER_NAME',
};

/** Kambi's league (its event groups below the sport, see the kambi parser) → provider league. */
const LEAGUES: Record<string, Sport> = {
  NFL: 'NFL',
  NCAAF: 'NCAAF',
  'NCAA FOOTBALL': 'NCAAF',
  'COLLEGE FOOTBALL': 'NCAAF',
  NBA: 'NBA',
  WNBA: 'WNBA',
  MLB: 'MLB',
  NHL: 'NHL',
  'ENGLAND / PREMIER LEAGUE': 'EPL',
  'SPAIN / LA LIGA': 'LALIGA',
  UFC: 'UFC',
};

/** Words that say nothing about which club it is: "AFC Bournemouth", "FC Barcelona", "Athletic Club". */
const CLUB_FILLER = new Set(['fc', 'afc', 'cf', 'sc', 'club', 'cd', 'ud', 'rcd', 'the']);
const clubWords = (s: string) => normalizeText(s).split(' ').filter((w) => w && !CLUB_FILLER.has(w));
const within = (a: string[], b: string[]) => a.length > 0 && a.every((w) => b.includes(w));

/** Kambi → ESPN league ids. Kambi sends the league in eventGroups (e.g. "NFL"). */
export function sportForLeague(league: string | null): Sport | null {
  return LEAGUES[(league ?? '').trim().toUpperCase()] ?? null;
}

export function teamMatches(sport: Sport, sportsbookName: string, team: ProviderTeam): boolean {
  const kambi = normalizeText(stripRanking(sportsbookName));
  if (!kambi) return false;
  if (sport === 'NFL') {
    const nickname = kambi.split(' ').at(-1)!;
    return !!team.name && normalizeText(team.name) === nickname;
  }
  const kind = SPORT_KIND[sport];
  if (kind === 'basketball' || kind === 'baseball' || kind === 'hockey') {
    // "LA Clippers" / "LA Lakers": the city prefix is shared, the nickname isn't.
    const nickname = team.name ? normalizeText(team.name) : '';
    return !!nickname && (kambi === nickname || kambi.endsWith(` ${nickname}`));
  }
  if (kind === 'soccer') {
    const words = clubWords(sportsbookName);
    return [team.displayName, team.name, team.location].some((n) => {
      const theirs = n ? clubWords(n) : [];
      return within(words, theirs) || within(theirs, words);
    });
  }
  if (kind === 'mma') {
    const name = team.displayName ?? team.name;
    if (!name) return false;
    const a = normalizePersonName(stripRanking(sportsbookName));
    const b = normalizePersonName(name);
    // "Alex Volkanovski" / "Alexander Volkanovski". Both fighters must match, so a shortened first name is safe.
    return a.base === b.base || (!!a.last && a.last === b.last && (a.first.startsWith(b.first) || b.first.startsWith(a.first)));
  }
  const candidates = [team.location, team.displayName, team.abbreviation].filter((v): v is string => !!v).map(normalizeText);
  return candidates.includes(kambi);
}

export function matchEvent(sb: SportsbookEvent, candidates: ProviderEvent[]): EventMatch {
  const start = Date.parse(sb.startAt);
  const window = SPORT_KIND[sb.sport] === 'mma' ? MAX_FIGHT_START_DIFF_MS : MAX_START_DIFF_MS;
  const inWindow = candidates.filter((e) => e.sport === sb.sport && Number.isFinite(start) && Math.abs(Date.parse(e.startAt) - start) <= window);

  const hits = inWindow.flatMap((e) => {
    const straight = teamMatches(sb.sport, sb.homeName, e.home) && teamMatches(sb.sport, sb.awayName, e.away);
    const swapped = teamMatches(sb.sport, sb.homeName, e.away) && teamMatches(sb.sport, sb.awayName, e.home);
    return straight || swapped ? [{ e, swapped: !straight }] : [];
  });

  if (hits.length === 0) return { ok: false, reason: 'NO_CANDIDATE', candidates: inWindow };
  if (hits.length > 1) return { ok: false, reason: 'AMBIGUOUS', candidates: hits.map((h) => h.e) };

  const { e, swapped } = hits[0]!;
  // A bout's start on Kambi is only an estimate.
  const exactStart = SPORT_KIND[sb.sport] === 'mma' || Math.abs(Date.parse(e.startAt) - start) <= 15 * 60 * 1000;
  // Swapped home/away is expected at neutral sites (Kambi writes "A vs B").
  const confidence = exactStart && (!swapped || e.neutralSite) ? 1 : 0.95;
  return { ok: true, event: e, confidence, method: METHODS[sb.sport], swapped };
}
