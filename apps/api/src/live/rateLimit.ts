import { ProviderError, type FetchJson } from '@sports-better/sports-data';

/**
 * Guards an unofficial provider (ESPN publishes no limits; see
 * docs/sports-data.md). Two layers:
 *  - a hard budget of `maxPerMinute` requests (sliding 60 s window);
 *  - a shared pause after a 429 (Retry-After, else 1 → 2 → 4 … 15 min) or
 *    after repeated network/5xx failures (2 min).
 * While over budget or paused, calls fail fast with RATE_LIMITED instead of
 * waiting, so a poll cycle skips work and keeps the last known progress.
 */
export interface RateLimitOptions {
  maxPerMinute: number;
  now?: () => number;
}

export interface RateLimitStats {
  sentLastMinute: number;
  pausedUntil: number | null;
  total: number;
  rejectedLocally: number;
  lastError: string | null;
}

const FAILURE_PAUSE_MS = 2 * 60_000;
const FAILURES_BEFORE_PAUSE = 3;
const MAX_429_PAUSE_MS = 15 * 60_000;

export class RateLimitedFetch {
  private sent: number[] = [];
  private pausedUntil = 0;
  private consecutive429 = 0;
  private consecutiveFailures = 0;
  private total = 0;
  private rejectedLocally = 0;
  private lastError: string | null = null;
  private readonly now: () => number;

  constructor(
    private readonly inner: FetchJson,
    private readonly opts: RateLimitOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  readonly fetchJson: FetchJson = async (url) => {
    const now = this.now();
    if (now < this.pausedUntil) {
      this.rejectedLocally++;
      throw new ProviderError('RATE_LIMITED', 'provider paused after errors', Math.ceil((this.pausedUntil - now) / 1000));
    }
    this.sent = this.sent.filter((t) => now - t < 60_000);
    if (this.sent.length >= this.opts.maxPerMinute) {
      this.rejectedLocally++;
      throw new ProviderError('RATE_LIMITED', `local budget of ${this.opts.maxPerMinute}/min reached`, Math.ceil((60_000 - (now - this.sent[0]!)) / 1000));
    }
    this.sent.push(now);
    this.total++;

    try {
      const body = await this.inner(url);
      this.consecutive429 = 0;
      this.consecutiveFailures = 0;
      return body;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof ProviderError && err.kind === 'RATE_LIMITED') {
        this.consecutive429++;
        const backoff = Math.min(60_000 * 2 ** (this.consecutive429 - 1), MAX_429_PAUSE_MS);
        const retryAfter = err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : 0;
        this.pausedUntil = this.now() + Math.max(backoff, retryAfter);
      } else if (err instanceof ProviderError && (err.kind === 'NETWORK' || err.kind === 'HTTP')) {
        if (++this.consecutiveFailures >= FAILURES_BEFORE_PAUSE) {
          this.pausedUntil = this.now() + FAILURE_PAUSE_MS;
          this.consecutiveFailures = 0;
        }
      }
      throw err;
    }
  };

  stats(): RateLimitStats {
    const now = this.now();
    return {
      sentLastMinute: this.sent.filter((t) => now - t < 60_000).length,
      pausedUntil: now < this.pausedUntil ? this.pausedUntil : null,
      total: this.total,
      rejectedLocally: this.rejectedLocally,
      lastError: this.lastError,
    };
  }
}
