import type { ProviderEvent, ProviderTeam, Sport } from '@sports-better/sports-data';
import { normalizeText, stripRanking } from './normalize';

/**
 * Links a Kambi event to a provider event. NFL team names differ between the
 * two ("WAS Commanders" vs WSH/"Commanders"), so NFL matches on nickname,
 * which is unique across the league. College matches on location after
 * stripping rankings ("(1) Texas" → ESPN location "Texas").
 */

export interface SportsbookEvent {
  sport: Sport;
  homeName: string;
  awayName: string;
  startAt: string;
}

export type MatchMethod = 'NFL_NICKNAME' | 'NCAAF_LOCATION';

export type EventMatch =
  | { ok: true; event: ProviderEvent; confidence: number; method: MatchMethod; swapped: boolean }
  | { ok: false; reason: 'NO_CANDIDATE' | 'AMBIGUOUS'; candidates: ProviderEvent[] };

const MAX_START_DIFF_MS = 3 * 60 * 60 * 1000;

/** Kambi → ESPN league ids. Kambi sends the league in eventGroups (e.g. "NFL"). */
export function sportForLeague(league: string | null): Sport | null {
  const l = (league ?? '').toUpperCase();
  if (l === 'NFL') return 'NFL';
  if (l === 'NCAAF' || l === 'NCAA FOOTBALL' || l === 'COLLEGE FOOTBALL') return 'NCAAF';
  return null;
}

export function teamMatches(sport: Sport, sportsbookName: string, team: ProviderTeam): boolean {
  const kambi = normalizeText(stripRanking(sportsbookName));
  if (!kambi) return false;
  if (sport === 'NFL') {
    const nickname = kambi.split(' ').at(-1)!;
    return !!team.name && normalizeText(team.name) === nickname;
  }
  const candidates = [team.location, team.displayName, team.abbreviation].filter((v): v is string => !!v).map(normalizeText);
  return candidates.includes(kambi);
}

export function matchEvent(sb: SportsbookEvent, candidates: ProviderEvent[]): EventMatch {
  const start = Date.parse(sb.startAt);
  const inWindow = candidates.filter(
    (e) => e.sport === sb.sport && Number.isFinite(start) && Math.abs(Date.parse(e.startAt) - start) <= MAX_START_DIFF_MS,
  );

  const hits = inWindow.flatMap((e) => {
    const straight = teamMatches(sb.sport, sb.homeName, e.home) && teamMatches(sb.sport, sb.awayName, e.away);
    const swapped = teamMatches(sb.sport, sb.homeName, e.away) && teamMatches(sb.sport, sb.awayName, e.home);
    return straight || swapped ? [{ e, swapped: !straight }] : [];
  });

  if (hits.length === 0) return { ok: false, reason: 'NO_CANDIDATE', candidates: inWindow };
  if (hits.length > 1) return { ok: false, reason: 'AMBIGUOUS', candidates: hits.map((h) => h.e) };

  const { e, swapped } = hits[0]!;
  const exactStart = Math.abs(Date.parse(e.startAt) - start) <= 15 * 60 * 1000;
  // Swapped home/away is expected at neutral sites (Kambi writes "A vs B").
  const confidence = exactStart && (!swapped || e.neutralSite) ? 1 : 0.95;
  return { ok: true, event: e, confidence, method: sb.sport === 'NFL' ? 'NFL_NICKNAME' : 'NCAAF_LOCATION', swapped };
}
