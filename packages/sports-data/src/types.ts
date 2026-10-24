/**
 * Provider-neutral live sports data. Nothing here knows about sportsbooks;
 * the tracker joins these to Kambi selections through the matching package.
 */

export type Sport = 'NFL' | 'NCAAF' | 'NBA' | 'WNBA' | 'MLB' | 'NHL' | 'EPL' | 'LALIGA' | 'UFC';

/** How a sport is played, for everything that differs by kind rather than by league. */
export type SportKind = 'football' | 'basketball' | 'baseball' | 'hockey' | 'soccer' | 'mma';

export const SPORT_KIND: Record<Sport, SportKind> = {
  NFL: 'football',
  NCAAF: 'football',
  NBA: 'basketball',
  WNBA: 'basketball',
  MLB: 'baseball',
  NHL: 'hockey',
  EPL: 'soccer',
  LALIGA: 'soccer',
  UFC: 'mma',
};

export type GameState = 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED' | 'UNKNOWN';

/** Normalized per-player stats. Absent = the provider listed nothing for it. */
export type StatKey =
  | 'PASS_COMPLETIONS'
  | 'PASS_ATTEMPTS'
  | 'PASSING_YARDS'
  | 'PASSING_TDS'
  | 'INTERCEPTIONS_THROWN'
  | 'RUSHING_ATTEMPTS'
  | 'RUSHING_YARDS'
  | 'RUSHING_TDS'
  | 'RECEPTIONS'
  | 'RECEIVING_YARDS'
  | 'RECEIVING_TDS'
  /** Rushing + receiving yards, for combined "Rushing & Receiving Yards" props. */
  | 'RUSHING_RECEIVING_YARDS'
  | 'KICK_RETURN_TDS'
  | 'PUNT_RETURN_TDS'
  | 'DEFENSIVE_TDS'
  /** Sacks made (defense); halves are possible when shared. */
  | 'SACKS'
  | 'FIELD_GOALS_MADE'
  | 'FIELD_GOAL_ATTEMPTS'
  /** Scrimmage + return + defensive TDs. Passing TDs are excluded. */
  | 'TOUCHDOWNS'
  // Basketball
  | 'POINTS'
  | 'REBOUNDS'
  | 'ASSISTS'
  | 'STEALS'
  | 'BLOCKS'
  | 'THREES_MADE'
  /** Combined props: points + rebounds, and so on. */
  | 'POINTS_REBOUNDS'
  | 'POINTS_ASSISTS'
  | 'REBOUNDS_ASSISTS'
  | 'POINTS_REBOUNDS_ASSISTS'
  | 'STEALS_BLOCKS'
  /** 1 once 10+ in two (double) or three (triple) of points, rebounds, assists, steals, blocks; else 0. */
  | 'DOUBLE_DOUBLE'
  | 'TRIPLE_DOUBLE'
  // Baseball (batters, then pitchers)
  | 'HITS'
  | 'RUNS'
  | 'RBIS'
  | 'HOME_RUNS'
  | 'HITS_RUNS_RBIS'
  | 'PITCHER_STRIKEOUTS'
  /** Innings pitched as outs: 6.2 innings = 20. */
  | 'OUTS_RECORDED'
  // Hockey and soccer (hockey points are POINTS: goals + assists)
  | 'GOALS'
  | 'SHOTS_ON_GOAL'
  | 'SHOTS_ON_TARGET'
  | 'SHOTS'
  /** Yellow and red cards shown to the player. */
  | 'CARDS'
  | 'RED_CARDS'
  /** Soccer team stat; only in EventSnapshot.gameStats. */
  | 'CORNERS';

export type StatLine = Partial<Record<StatKey, number>>;

export interface ProviderTeam {
  id: string;
  abbreviation: string | null;
  /** "Kansas City", "Texas" */
  location: string | null;
  /** Nickname: "Chiefs", "Longhorns" */
  name: string | null;
  displayName: string | null;
}

export interface EventState {
  state: GameState;
  period: number | null;
  clock: string | null;
  /** Provider's human text, e.g. "10:56 - 3rd Quarter", "Halftime". */
  detail: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** Live down-by-down detail; null when not live or not provided. */
  situation: GameSituation | null;
  /** MMA only: how the bout went. Fighters have no score. */
  fight?: FightResult | null;
}

export interface FightResult {
  /** Null until it's decided, and for a draw or no contest. */
  winner: 'home' | 'away' | null;
  /** KO_TKO includes disqualifications, as Island Luck groups them. Null until it's over. */
  method: 'KO_TKO' | 'SUBMISSION' | 'DECISION' | null;
  /** The round it ended in (or the current one) and the time into it. */
  round: number | null;
  clockSeconds: number | null;
  scheduledRounds: number | null;
}

/** Football's down-by-down detail; basketball has only `lastPlay`, the rest null. */
export interface GameSituation {
  /** Team with the ball; null between plays that have no possession (timeouts, quarter breaks). */
  possessionTeamId: string | null;
  /** "1st & 10 at HOU 2", "4th & 1 at NE 47"; null without possession. */
  downDistance: string | null;
  /** Only true while a team has the ball inside the 20. */
  redZone: boolean;
  homeTimeouts: number | null;
  awayTimeouts: number | null;
  lastPlay: string | null;
}

export interface ProviderEvent {
  provider: string;
  sport: Sport;
  id: string;
  startAt: string;
  neutralSite: boolean;
  home: ProviderTeam;
  away: ProviderTeam;
  state: EventState;
}

export interface ProviderPlayer {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  teamId: string;
  position: string | null;
}

export interface PlayerStats {
  player: ProviderPlayer;
  stats: StatLine;
}

export interface EventSnapshot {
  provider: string;
  sport: Sport;
  eventId: string;
  state: EventState;
  home: ProviderTeam;
  away: ProviderTeam;
  /** Only players the provider has recorded a stat for. */
  players: PlayerStats[];
  /** Whole-game team stats summed across both sides, where the provider has them (soccer corners). */
  gameStats?: StatLine;
  fetchedAt: string;
}

export interface SportsDataProvider {
  readonly id: string;
  readonly sports: readonly Sport[];
  /** Games starting on the given calendar days (provider's local day, YYYY-MM-DD). */
  listEvents(sport: Sport, days: string[]): Promise<ProviderEvent[]>;
  /** Game state and every recorded player stat, in one fetch. */
  getEventSnapshot(sport: Sport, eventId: string): Promise<EventSnapshot>;
  /** Full team roster, for matching players who haven't recorded a stat yet. */
  getRoster(sport: Sport, teamId: string): Promise<ProviderPlayer[]>;
}

export type ProviderErrorKind = 'RATE_LIMITED' | 'NOT_FOUND' | 'HTTP' | 'NETWORK' | 'UNEXPECTED_SHAPE' | 'UNSUPPORTED_SPORT';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
