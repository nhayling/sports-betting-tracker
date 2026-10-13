import { defaultFetchJson, EspnProvider, type SportsDataProvider } from '@sports-better/sports-data';
import type { Db } from '../db';
import { recordNotifications } from '../notifications/store';
import { runPollCycle, type CycleReport } from './pollCycle';
import { RateLimitedFetch, type RateLimitStats } from './rateLimit';

/**
 * Runs poll cycles every ~30 s (ESPN box scores change every 10–30 s during
 * play; see docs/sports-data.md). Cycles never overlap, and a cycle with no
 * open bets near game time makes no network requests.
 */
export interface PollerStatus {
  running: boolean;
  intervalMs: number;
  lastReport: CycleReport | null;
  lastError: string | null;
  provider: RateLimitStats;
}

export function startPoller(db: Db, opts: { intervalMs?: number; maxPerMinute?: number; log?: (msg: string) => void } = {}) {
  const intervalMs = opts.intervalMs ?? 30_000;
  const log = opts.log ?? ((m) => console.log(`[poller] ${m}`));
  const limiter = new RateLimitedFetch(defaultFetchJson, { maxPerMinute: opts.maxPerMinute ?? 60 });
  const provider: SportsDataProvider = new EspnProvider(limiter.fetchJson);

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  const status: Omit<PollerStatus, 'provider' | 'running'> = { intervalMs, lastReport: null, lastError: null };

  const tick = async () => {
    try {
      const report = await runPollCycle(db, provider);
      status.lastReport = report;
      const created = await recordNotifications(db);
      if (created) log(`${created} new notification${created === 1 ? '' : 's'}`);
      status.lastError = null;
      const { scoreboard, summary, roster } = report.requests;
      if (scoreboard + summary + roster > 0 || report.errors.length) {
        log(
          `${report.liveEvents} live games · ${scoreboard + summary + roster} requests (${scoreboard} scoreboard, ${summary} box score, ${roster} roster) · ${report.progressWritten} progress rows` +
            (report.errors.length ? ` · errors: ${report.errors.join('; ')}` : ''),
        );
      }
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
      log(`cycle failed: ${status.lastError}`);
    } finally {
      // ±2 s jitter so requests don't land on exact boundaries.
      if (!stopped) timer = setTimeout(tick, intervalMs + Math.round((Math.random() - 0.5) * 4000));
    }
  };
  timer = setTimeout(tick, 1000);

  return {
    status: (): PollerStatus => ({ ...status, running: !stopped, provider: limiter.stats() }),
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
