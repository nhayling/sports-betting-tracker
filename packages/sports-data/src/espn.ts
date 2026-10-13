import {
  ProviderError,
  type EventSnapshot,
  type EventState,
  type GameSituation,
  type GameState,
  type PlayerStats,
  type ProviderEvent,
  type ProviderPlayer,
  type ProviderTeam,
  type Sport,
  type SportsDataProvider,
  type StatKey,
  type StatLine,
} from './types';

/**
 * ESPN's public site API (unofficial, no key). Researched in docs/sports-data.md.
 * Everything ESPN-specific stays in this file.
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const PATHS: Record<Sport, string> = { NFL: 'football/nfl', NCAAF: 'football/college-football' };
/** College scoreboard defaults to ranked games only; group 80 = all FBS. */
const SCOREBOARD_PARAMS: Partial<Record<Sport, string>> = { NCAAF: 'groups=80&limit=300' };

/** Box score category.key → normalized stat. */
const STAT_MAP: Record<string, Partial<Record<string, StatKey>>> = {
  passing: { passingYards: 'PASSING_YARDS', passingTouchdowns: 'PASSING_TDS', interceptions: 'INTERCEPTIONS_THROWN' },
  rushing: { rushingAttempts: 'RUSHING_ATTEMPTS', rushingYards: 'RUSHING_YARDS', rushingTouchdowns: 'RUSHING_TDS' },
  receiving: { receptions: 'RECEPTIONS', receivingYards: 'RECEIVING_YARDS', receivingTouchdowns: 'RECEIVING_TDS' },
  kickReturns: { kickReturnTouchdowns: 'KICK_RETURN_TDS' },
  puntReturns: { puntReturnTouchdowns: 'PUNT_RETURN_TDS' },
  defensive: { defensiveTouchdowns: 'DEFENSIVE_TDS', sacks: 'SACKS' },
};

export type FetchJson = (url: string) => Promise<unknown>;

export async function defaultFetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new ProviderError('NETWORK', `ESPN request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after'));
    throw new ProviderError('RATE_LIMITED', 'ESPN rate limit', Number.isFinite(retry) && retry > 0 ? retry : 60);
  }
  if (res.status === 404) throw new ProviderError('NOT_FOUND', `ESPN 404: ${url}`);
  if (!res.ok) throw new ProviderError('HTTP', `ESPN ${res.status}: ${url}`);
  return res.json();
}

export class EspnProvider implements SportsDataProvider {
  readonly id = 'ESPN';
  readonly sports = ['NFL', 'NCAAF'] as const;

  constructor(private readonly fetchJson: FetchJson = defaultFetchJson) {}

  async listEvents(sport: Sport, days: string[]): Promise<ProviderEvent[]> {
    const events = new Map<string, ProviderEvent>();
    for (const day of days) {
      const params = [`dates=${day.replaceAll('-', '')}`, SCOREBOARD_PARAMS[sport]].filter(Boolean).join('&');
      const body = (await this.fetchJson(`${this.url(sport)}/scoreboard?${params}`)) as any;
      if (!Array.isArray(body?.events)) throw new ProviderError('UNEXPECTED_SHAPE', 'scoreboard has no events[]');
      for (const e of body.events) {
        const parsed = parseScoreboardEvent(sport, e);
        if (parsed) events.set(parsed.id, parsed);
      }
    }
    return [...events.values()];
  }

  async getEventSnapshot(sport: Sport, eventId: string): Promise<EventSnapshot> {
    const body = (await this.fetchJson(`${this.url(sport)}/summary?event=${encodeURIComponent(eventId)}`)) as any;
    return parseSummary(sport, eventId, body, new Date());
  }

  async getRoster(sport: Sport, teamId: string): Promise<ProviderPlayer[]> {
    const body = (await this.fetchJson(`${this.url(sport)}/teams/${encodeURIComponent(teamId)}/roster`)) as any;
    return parseRoster(teamId, body);
  }

  private url(sport: Sport): string {
    const path = PATHS[sport];
    if (!path) throw new ProviderError('UNSUPPORTED_SPORT', `ESPN provider does not support ${sport}`);
    return `${BASE}/${path}`;
  }
}

// ── parsing (exported for tests) ───────────────────────────────────────────

export function parseScoreboardEvent(sport: Sport, e: any): ProviderEvent | null {
  const comp = e?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  if (!comp || !home || !away) return null;
  return {
    provider: 'ESPN',
    sport,
    id: String(e.id),
    startAt: new Date(e.date ?? comp.date).toISOString(),
    neutralSite: Boolean(comp.neutralSite),
    home: parseTeam(home.team),
    away: parseTeam(away.team),
    state: parseState(comp.status, home.score, away.score, comp.situation),
  };
}

export function parseSummary(sport: Sport, eventId: string, body: any, fetchedAt: Date): EventSnapshot {
  const comp = body?.header?.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  if (!comp || !home || !away) throw new ProviderError('UNEXPECTED_SHAPE', `summary ${eventId} has no header competitors`);

  const byId = new Map<string, PlayerStats>();
  for (const teamBlock of body?.boxscore?.players ?? []) {
    const teamId = String(teamBlock.team?.id ?? '');
    for (const category of teamBlock.statistics ?? []) {
      const map = STAT_MAP[category.name];
      const keys: string[] = category.keys ?? [];
      for (const row of category.athletes ?? []) {
        const a = row.athlete;
        if (!a?.id) continue;
        const id = String(a.id);
        let entry = byId.get(id);
        if (!entry) {
          entry = { player: parsePlayer(a, teamId, null), stats: {} };
          byId.set(id, entry);
        }
        keys.forEach((key, i) => readStat(entry!.stats, category.name, map, key, row.stats?.[i]));
      }
    }
  }
  for (const p of byId.values()) {
    p.stats.TOUCHDOWNS = totalTouchdowns(p.stats);
    p.stats.RUSHING_RECEIVING_YARDS = (p.stats.RUSHING_YARDS ?? 0) + (p.stats.RECEIVING_YARDS ?? 0);
  }

  return {
    provider: 'ESPN',
    sport,
    eventId,
    state: parseState(comp.status, home.score, away.score),
    home: parseTeam(home.team),
    away: parseTeam(away.team),
    players: [...byId.values()],
    fetchedAt: fetchedAt.toISOString(),
  };
}

export function parseRoster(teamId: string, body: any): ProviderPlayer[] {
  const groups = body?.athletes;
  if (!Array.isArray(groups)) throw new ProviderError('UNEXPECTED_SHAPE', `roster ${teamId} has no athletes[]`);
  // Newer shape groups players by unit ({position, items}); older is a flat list.
  const athletes = groups.flatMap((g: any) => (Array.isArray(g?.items) ? g.items : [g]));
  return athletes.filter((a: any) => a?.id).map((a: any) => parsePlayer(a, teamId, a.position?.abbreviation ?? null));
}

function readStat(stats: StatLine, category: string, map: Partial<Record<string, StatKey>> | undefined, key: string, raw: unknown) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return;
  // Made/attempted pairs arrive as "12/13".
  const pairs: Record<string, [StatKey, StatKey]> = {
    'passing:completions/passingAttempts': ['PASS_COMPLETIONS', 'PASS_ATTEMPTS'],
    'kicking:fieldGoalsMade/fieldGoalAttempts': ['FIELD_GOALS_MADE', 'FIELD_GOAL_ATTEMPTS'],
  };
  const pair = pairs[`${category}:${key}`];
  if (pair && typeof raw === 'string') {
    const [made, attempts] = raw.split('/').map(Number);
    if (Number.isFinite(made)) stats[pair[0]] = made;
    if (Number.isFinite(attempts)) stats[pair[1]] = attempts;
    return;
  }
  const target = map?.[key];
  if (!target) return;
  const n = Number(raw);
  if (Number.isFinite(n)) stats[target] = n;
}

/**
 * Touchdowns that count for a "Touchdown Scorer" market: rushing, receiving,
 * kick/punt returns and defensive scores. A QB's passing TDs don't count.
 * Interception-return TDs are taken from ESPN's defensive TD column only
 * (interceptionTouchdowns is not read) to avoid counting them twice.
 */
function totalTouchdowns(s: StatLine): number {
  return (s.RUSHING_TDS ?? 0) + (s.RECEIVING_TDS ?? 0) + (s.KICK_RETURN_TDS ?? 0) + (s.PUNT_RETURN_TDS ?? 0) + (s.DEFENSIVE_TDS ?? 0);
}

function parseTeam(t: any): ProviderTeam {
  return {
    id: String(t?.id ?? ''),
    abbreviation: t?.abbreviation ?? null,
    location: t?.location ?? null,
    name: t?.name ?? null,
    displayName: t?.displayName ?? null,
  };
}

function parsePlayer(a: any, teamId: string, position: string | null): ProviderPlayer {
  return {
    id: String(a.id),
    displayName: a.displayName ?? a.fullName ?? `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim(),
    firstName: a.firstName ?? null,
    lastName: a.lastName ?? null,
    teamId,
    position,
  };
}

const STATE_MAP: Record<string, GameState> = { pre: 'SCHEDULED', in: 'LIVE', post: 'FINAL' };

function parseSituation(s: any): GameSituation | null {
  if (!s || typeof s !== 'object') return null;
  // ESPN omits possession (and sends down -1) during timeouts and breaks, but
  // leaves isRedZone set; only trust it while someone has the ball.
  const possessionTeamId = s.possession !== undefined && s.possession !== null && s.possession !== '' ? String(s.possession) : null;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    possessionTeamId,
    downDistance: possessionTeamId ? (s.downDistanceText ?? null) : null,
    redZone: possessionTeamId !== null && s.isRedZone === true,
    homeTimeouts: num(s.homeTimeouts),
    awayTimeouts: num(s.awayTimeouts),
    lastPlay: typeof s.lastPlay?.text === 'string' ? s.lastPlay.text.trim() : null,
  };
}

function parseState(status: any, homeScore: unknown, awayScore: unknown, situation?: unknown): EventState {
  const type = status?.type ?? {};
  let state: GameState = STATE_MAP[type.state] ?? 'UNKNOWN';
  if (/postpon|cancel|suspend/i.test(`${type.name ?? ''} ${type.description ?? ''}`)) state = 'POSTPONED';
  const score = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
  return {
    state,
    period: typeof status?.period === 'number' ? status.period : null,
    clock: status?.displayClock ?? null,
    detail: type.detail ?? type.shortDetail ?? null,
    homeScore: state === 'SCHEDULED' ? null : score(homeScore),
    awayScore: state === 'SCHEDULED' ? null : score(awayScore),
    situation: state === 'LIVE' ? parseSituation(situation) : null,
  };
}
