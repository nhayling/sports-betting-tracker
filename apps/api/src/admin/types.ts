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
