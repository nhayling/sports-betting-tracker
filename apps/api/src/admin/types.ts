/** What the admin site (apps/web/src/admin) reads from /api/admin. Dates are ISO strings. */

export interface AccessRequest {
  username: string;
  email: string | null;
  /** What they wrote when asking ("Noah's cousin"). */
  note: string | null;
  askedAt: string;
}

export interface Member {
  username: string;
  displayName: string | null;
  email: string | null;
  admin: boolean;
  joinedAt: string;
  /** Newest Island Luck sync on any of their accounts. */
  lastSyncAt: string | null;
  /** Newest activity on any web sign-in. */
  lastSeenAt: string | null;
}

export interface InviteRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByUsername: string | null;
}

/** A new invite. The link is shown once: only a hash of its token is kept. */
export interface NewInvite {
  url: string;
  expiresAt: string;
}

/** A player a pick's stats can't be read for: the match wasn't sure, or nobody in the game fits. */
export interface PlayerIssue {
  participantId: string;
  /** As Island Luck writes it. */
  name: string;
  picks: number;
  openPicks: number;
  /** Their newest game. */
  game: string | null;
  startAt: string | null;
  /** ESPN's near matches, likeliest first. Empty when nobody came close. */
  candidates: { id: string; name: string }[];
}

/** A market no built-in rule or saved rule covers. Numbers in the name are grouped, so "40+ X" and "60+ X" are one. */
export interface MarketIssue {
  sport: string;
  marketName: string;
  /** A pick on it: "Jayden Daniels · Under". */
  example: string | null;
  picks: number;
  openPicks: number;
  /** PLAYER, or GAME when nobody is named on its picks. */
  scope: 'PLAYER' | 'GAME';
  /** The stats ESPN has that it can be tracked as. */
  stats: { key: string; label: string }[];
}

export interface TrackedMarket {
  sport: string;
  marketName: string;
  stat: string;
  addedBy: string;
  addedAt: string;
}

export interface IgnoredMarket {
  sport: string;
  marketName: string;
}

/** A player someone decided on. `linkedTo` is null for "no match". */
export interface PlayerDecision {
  participantId: string;
  name: string;
  linkedTo: string | null;
  decidedAt: string;
}

export interface Tracking {
  players: PlayerIssue[];
  markets: MarketIssue[];
  tracked: TrackedMarket[];
  ignored: IgnoredMarket[];
  decisions: PlayerDecision[];
  /** Games being re-read after a fix, and what went wrong on the last run. */
  refresh: { games: number; errors: string[] };
}

export interface GamePlayer {
  id: string;
  name: string;
  position: string | null;
}
