/** Failed-login throttle per client: 5 failures per 15 minutes, then 429 until the window passes. */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

type Failure = { at: number; login: string };

export class LoginLimiter {
  private failures = new Map<string, Failure[]>();

  constructor(private readonly now: () => number = Date.now) {}

  retryAfterSeconds(key: string): number | null {
    const recent = this.recent(key);
    if (recent.length < MAX_FAILURES) return null;
    return Math.ceil((recent[0]!.at + WINDOW_MS - this.now()) / 1000);
  }

  /** Counts an attempt at `login`. Call it before checking the password, so guesses sent all at once are counted too. */
  fail(key: string, login = '') {
    this.failures.set(key, [...this.recent(key), { at: this.now(), login }]);
  }

  /**
   * Clears the client's failures for `login` only. Clearing them all would let anyone reset the
   * count by signing in to an account of their own between guesses at someone else's.
   */
  succeed(key: string, login = '') {
    const rest = this.recent(key).filter((f) => f.login !== login);
    if (rest.length) this.failures.set(key, rest);
    else this.failures.delete(key);
  }

  private recent(key: string): Failure[] {
    const cutoff = this.now() - WINDOW_MS;
    return (this.failures.get(key) ?? []).filter((f) => f.at > cutoff);
  }
}
