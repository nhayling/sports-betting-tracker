/** Failed-login throttle per client: 5 failures per 15 minutes, then 429 until the window passes. */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export class LoginLimiter {
  private failures = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  retryAfterSeconds(key: string): number | null {
    const recent = this.recent(key);
    if (recent.length < MAX_FAILURES) return null;
    return Math.ceil((recent[0]! + WINDOW_MS - this.now()) / 1000);
  }

  fail(key: string) {
    this.failures.set(key, [...this.recent(key), this.now()]);
  }

  succeed(key: string) {
    this.failures.delete(key);
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - WINDOW_MS;
    return (this.failures.get(key) ?? []).filter((t) => t > cutoff);
  }
}
