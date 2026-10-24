import {
  ProviderError,
  type EventSnapshot,
  type EventState,
  type GameSituation,
  type GameState,
  type PlayerStats,
  type ProviderEvent,
  type ProviderPlayer,
  type FightResult,
  type ProviderTeam,
  SPORT_KIND,
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
const PATHS: Record<Sport, string> = {
  NFL: 'football/nfl',
  NCAAF: 'football/college-football',
  NBA: 'basketball/nba',
  WNBA: 'basketball/wnba',
  MLB: 'baseball/mlb',
  NHL: 'hockey/nhl',
  EPL: 'soccer/eng.1',
  LALIGA: 'soccer/esp.1',
  UFC: 'mma/ufc',
};
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
  // Baseball's categories are unnamed; their type ("batting", "pitching") stands in.
  batting: { hits: 'HITS', runs: 'RUNS', RBIs: 'RBIS', homeRuns: 'HOME_RUNS' },
  pitching: { strikeouts: 'PITCHER_STRIKEOUTS' },
  // Hockey groups skaters by position; goalies' columns aren't read.
  forwards: { goals: 'GOALS', assists: 'ASSISTS', shotsTotal: 'SHOTS_ON_GOAL' },
  defenses: { goals: 'GOALS', assists: 'ASSISTS', shotsTotal: 'SHOTS_ON_GOAL' },
  skaters: { goals: 'GOALS', assists: 'ASSISTS', shotsTotal: 'SHOTS_ON_GOAL' },
};

/** Soccer's player stats come from the summary's rosters, by name. Cards are added up after. */
const SOCCER_STATS: Partial<Record<string, StatKey>> = {
  totalGoals: 'GOALS',
  goalAssists: 'ASSISTS',
  shotsOnTarget: 'SHOTS_ON_TARGET',
  totalShots: 'SHOTS',
  redCards: 'RED_CARDS',
};

/** Basketball's box score is one unnamed category; its keys are read directly. */
const BASKETBALL_STATS: Partial<Record<string, StatKey>> = {
  points: 'POINTS',
  rebounds: 'REBOUNDS',
  assists: 'ASSISTS',
  steals: 'STEALS',
  blocks: 'BLOCKS',
};
const BASKETBALL_CATEGORY = 'basketball';

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
  readonly sports = ['NFL', 'NCAAF', 'NBA', 'WNBA', 'MLB', 'NHL', 'EPL', 'LALIGA', 'UFC'] as const;

  constructor(private readonly fetchJson: FetchJson = defaultFetchJson) {}

  async listEvents(sport: Sport, days: string[]): Promise<ProviderEvent[]> {
    const events = new Map<string, ProviderEvent>();
    for (const day of days) {
      const params = [`dates=${day.replaceAll('-', '')}`, SCOREBOARD_PARAMS[sport]].filter(Boolean).join('&');
      const body = (await this.fetchJson(`${this.url(sport)}/scoreboard?${params}`)) as any;
      if (!Array.isArray(body?.events)) throw new ProviderError('UNEXPECTED_SHAPE', 'scoreboard has no events[]');
      for (const e of body.events) {
        // A UFC event is a fight card; each bout is its own game here, as on Island Luck.
        const parsed = SPORT_KIND[sport] === 'mma' ? parseFightCard(e) : [parseScoreboardEvent(sport, e)];
        for (const p of parsed) if (p) events.set(p.id, p);
      }
    }
    return [...events.values()];
  }

  async getEventSnapshot(sport: Sport, eventId: string): Promise<EventSnapshot> {
    // Fights have no player stats; the scoreboard carries the result.
    if (SPORT_KIND[sport] === 'mma') throw new ProviderError('UNSUPPORTED_SPORT', 'MMA has no box score');
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

  const kind = SPORT_KIND[sport];
  const byId = new Map<string, PlayerStats>();
  if (kind === 'soccer') readSoccerRosters(body, byId);
  for (const teamBlock of kind === 'soccer' ? [] : (body?.boxscore?.players ?? [])) {
    const teamId = String(teamBlock.team?.id ?? '');
    for (const category of teamBlock.statistics ?? []) {
      const name: string = kind === 'basketball' ? BASKETBALL_CATEGORY : (category.name ?? category.type);
      const map = kind === 'basketball' ? BASKETBALL_STATS : STAT_MAP[name];
      const keys: string[] = category.keys ?? [];
      for (const row of category.athletes ?? []) {
        const a = row.athlete;
        // Basketball lists the whole bench; a player who hasn't played has no stats yet.
        if (!a?.id || (Array.isArray(row.stats) && row.stats.length === 0)) continue;
        const id = String(a.id);
        let entry = byId.get(id);
        if (!entry) {
          entry = { player: parsePlayer(a, teamId, null), stats: {} };
          byId.set(id, entry);
        }
        keys.forEach((key, i) => readStat(entry!.stats, name, map, key, row.stats?.[i]));
      }
    }
  }
  for (const p of byId.values()) {
    const s = p.stats;
    if (kind === 'basketball') Object.assign(s, basketballCombos(s));
    else if (kind === 'baseball') s.HITS_RUNS_RBIS = (s.HITS ?? 0) + (s.RUNS ?? 0) + (s.RBIS ?? 0);
    else if (kind === 'hockey') s.POINTS = (s.GOALS ?? 0) + (s.ASSISTS ?? 0);
    else if (kind === 'football') {
      s.TOUCHDOWNS = totalTouchdowns(s);
      s.RUSHING_RECEIVING_YARDS = (s.RUSHING_YARDS ?? 0) + (s.RECEIVING_YARDS ?? 0);
    }
  }

  return {
    provider: 'ESPN',
    sport,
    eventId,
    state: parseState(comp.status, home.score, away.score),
    home: parseTeam(home.team),
    away: parseTeam(away.team),
    players: [...byId.values()],
    ...(kind === 'soccer' ? { gameStats: soccerGameStats(body) } : {}),
    fetchedAt: fetchedAt.toISOString(),
  };
}

/** Every player in the match-day squad, with ESPN's per-player stats ({name, value}). */
function readSoccerRosters(body: any, byId: Map<string, PlayerStats>) {
  for (const side of body?.rosters ?? []) {
    const teamId = String(side.team?.id ?? '');
    for (const row of side.roster ?? []) {
      const a = row.athlete;
      if (!a?.id || !Array.isArray(row.stats)) continue;
      const stats: StatLine = {};
      let cards = 0;
      for (const st of row.stats) {
        const n = Number(st?.value);
        if (!Number.isFinite(n)) continue;
        const key = SOCCER_STATS[st.name];
        if (key) stats[key] = n;
        if (st.name === 'yellowCards' || st.name === 'redCards') cards += n;
      }
      stats.CARDS = cards;
      byId.set(String(a.id), { player: parsePlayer(a, teamId, row.position?.abbreviation ?? null), stats });
    }
  }
}

/** Corners for both teams together; ESPN keeps them as a team stat. */
function soccerGameStats(body: any): StatLine {
  let corners: number | null = null;
  for (const team of body?.boxscore?.teams ?? []) {
    const won = (team.statistics ?? []).find((s: any) => s.name === 'wonCorners');
    const n = Number(won?.displayValue ?? won?.value);
    if (Number.isFinite(n)) corners = (corners ?? 0) + n;
  }
  return corners === null ? {} : { CORNERS: corners };
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
  // Innings pitched, "6.2" = six innings and two outs.
  if (category === 'pitching' && key === 'fullInnings.partInnings') {
    const [full, part] = String(raw).split('.').map(Number);
    if (Number.isFinite(full)) stats.OUTS_RECORDED = full! * 3 + (Number.isFinite(part) ? part! : 0);
    return;
  }
  // Made/attempted pairs arrive as "12/13" (football) or "3-7" (basketball).
  const pairs: Record<string, [StatKey, StatKey | null]> = {
    'passing:completions/passingAttempts': ['PASS_COMPLETIONS', 'PASS_ATTEMPTS'],
    'kicking:fieldGoalsMade/fieldGoalAttempts': ['FIELD_GOALS_MADE', 'FIELD_GOAL_ATTEMPTS'],
    'basketball:threePointFieldGoalsMade-threePointFieldGoalsAttempted': ['THREES_MADE', null],
  };
  const pair = pairs[`${category}:${key}`];
  if (pair && typeof raw === 'string') {
    const [made, attempts] = raw.split(/[/-]/).map(Number);
    if (Number.isFinite(made)) stats[pair[0]] = made;
    if (pair[1] && Number.isFinite(attempts)) stats[pair[1]] = attempts;
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

/** Combined basketball props, and double/triple-doubles (10+ in two/three of the five counting stats). */
function basketballCombos(s: StatLine): StatLine {
  const [pts, reb, ast, stl, blk] = [s.POINTS ?? 0, s.REBOUNDS ?? 0, s.ASSISTS ?? 0, s.STEALS ?? 0, s.BLOCKS ?? 0];
  const tens = [pts, reb, ast, stl, blk].filter((n) => n >= 10).length;
  return {
    POINTS_REBOUNDS: pts + reb,
    POINTS_ASSISTS: pts + ast,
    REBOUNDS_ASSISTS: reb + ast,
    POINTS_REBOUNDS_ASSISTS: pts + reb + ast,
    STEALS_BLOCKS: stl + blk,
    DOUBLE_DOUBLE: tens >= 2 ? 1 : 0,
    TRIPLE_DOUBLE: tens >= 3 ? 1 : 0,
  };
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

/** A fight card's bouts, each as a game between two fighters. Fighters stand in for teams; the first listed is "home". */
export function parseFightCard(e: any): Array<ProviderEvent | null> {
  return (e?.competitions ?? []).map((c: any): ProviderEvent | null => {
    const [a, b] = [...(c.competitors ?? [])].sort((x: any, y: any) => (x.order ?? 0) - (y.order ?? 0));
    if (!a?.athlete || !b?.athlete) return null;
    const state = parseState(c.status, null, null);
    return {
      provider: 'ESPN',
      sport: 'UFC',
      id: String(c.id),
      startAt: new Date(c.date ?? e.date).toISOString(),
      // Kambi lists fighters in its own order; either way round is a confident match.
      neutralSite: true,
      home: fighter(a.athlete),
      away: fighter(b.athlete),
      state: { ...state, fight: parseFight(c, state.state, a, b) },
    };
  });
}

function fighter(a: any): ProviderTeam {
  const name = a.displayName ?? a.fullName ?? null;
  return { id: String(a.id ?? ''), abbreviation: a.shortName ?? null, location: null, name, displayName: name };
}

/** ESPN's result note: "Unofficial Winner Kotko" (KO/TKO), "… Submission", "… Decision". */
function parseFight(c: any, state: GameState, home: any, away: any): FightResult {
  const notes = (c.details ?? []).map((d: any) => String(d?.type?.text ?? '')).join(' ');
  const round = typeof c.status?.period === 'number' && c.status.period > 0 ? c.status.period : null;
  const clockSeconds = typeof c.status?.clock === 'number' ? c.status.clock : clockToSeconds(c.status?.displayClock);
  const scheduledRounds = c.format?.regulation?.periods ?? null;
  const winner = home.winner ? 'home' : away.winner ? 'away' : null;
  let method: FightResult['method'] = null;
  if (state === 'FINAL') {
    if (/winner (kotko|ko|tko|dq)/i.test(notes)) method = 'KO_TKO';
    else if (/winner submission/i.test(notes)) method = 'SUBMISSION';
    else if (/winner decision/i.test(notes)) method = 'DECISION';
    // No note: a fight that ran the full distance went to the judges.
    else if (round !== null && round === scheduledRounds && clockSeconds === 300) method = 'DECISION';
  }
  return { winner, method, round, clockSeconds, scheduledRounds };
}

function clockToSeconds(clock: unknown): number | null {
  const m = /^(\d+):(\d{2})$/.exec(String(clock ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

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
