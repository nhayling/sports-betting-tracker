import type { ProviderPlayer } from '@sports-better/sports-data';
import { normalizePersonName } from './normalize';

/**
 * Links a Kambi participant name to a provider player from the two teams in
 * the matched game. Only confident, unique matches are auto-linked; anything
 * else is returned for manual confirmation rather than guessed.
 */

export type PlayerMatchMethod = 'EXACT_NAME' | 'NAME_WITHOUT_SUFFIX' | 'FIRST_INITIAL_LAST_NAME';

export type PlayerMatch =
  | { ok: true; player: ProviderPlayer; confidence: number; method: PlayerMatchMethod; autoLink: boolean }
  | { ok: false; reason: 'NO_CANDIDATE' | 'AMBIGUOUS'; candidates: ProviderPlayer[] };

/** Matches below this need a human to confirm before being saved. */
export const AUTO_LINK_THRESHOLD = 0.9;

export function matchPlayer(participantName: string, players: ProviderPlayer[]): PlayerMatch {
  const target = normalizePersonName(participantName);
  // Conflicting generational suffixes (Jr. vs III) mean different people at every tier.
  const pool = dedupe(players)
    .map((p) => ({ p, n: normalizePersonName(p.displayName) }))
    .filter(({ n }) => !n.suffix || !target.suffix || n.suffix === target.suffix);

  const tiers: Array<[PlayerMatchMethod, number, (n: ReturnType<typeof normalizePersonName>) => boolean]> = [
    ['EXACT_NAME', 1, (n) => n.full === target.full],
    // "Kenneth Walker" vs "Kenneth Walker III".
    ['NAME_WITHOUT_SUFFIX', 0.95, (n) => n.base === target.base],
    // "K. Walker" / "Ken Walker": same last name and first initial.
    ['FIRST_INITIAL_LAST_NAME', 0.75, (n) => n.last === target.last && n.first[0] === target.first[0]],
  ];

  for (const [method, confidence, test] of tiers) {
    const hits = pool.filter(({ n }) => test(n)).map(({ p }) => p);
    if (hits.length === 1) {
      return { ok: true, player: hits[0]!, confidence, method, autoLink: confidence >= AUTO_LINK_THRESHOLD };
    }
    if (hits.length > 1) return { ok: false, reason: 'AMBIGUOUS', candidates: hits };
  }
  return { ok: false, reason: 'NO_CANDIDATE', candidates: [] };
}

function dedupe(players: ProviderPlayer[]): ProviderPlayer[] {
  return [...new Map(players.map((p) => [p.id, p])).values()];
}
