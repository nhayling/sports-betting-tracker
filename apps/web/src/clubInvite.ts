/**
 * A club invite link opened before its owner could use it: signed out, or
 * with no account yet. Kept on this device through sign-in, asking to join and
 * registering, so they land on the club once they're in.
 */
const KEY = 'sports-better:club-invite';
/** Long enough for an access request to be approved by hand. */
const KEEP_MS = 14 * 24 * 60 * 60_000;
const JOIN_HASH = /^#social\/join\/([\w-]{8,64})$/;

/** The invite code in a #social/join/<code> link, if that's what the page was opened with. */
export const inviteCodeIn = (hash: string) => hash.match(JOIN_HASH)?.[1] ?? null;

export function rememberClubInvite(code: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // Not remembered: they open the link again once they're in.
  }
}

export function pendingClubInvite(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: unknown; at?: unknown } | null;
    if (saved && typeof saved.code === 'string' && typeof saved.at === 'number' && Date.now() - saved.at < KEEP_MS) return saved.code;
  } catch {
    // Unreadable counts as nothing waiting.
  }
  return null;
}

/** Done with it: joined, turned down, or the link no longer works. */
export function forgetClubInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
