import type { SportsDataProvider } from '@sports-better/sports-data';
import type { Db } from '../db';
import { MAX_GAME_MS, PREGAME_MS, runPollCycle } from './pollCycle';

/** Leaves most of the request budget to the live poller, and a replay is never urgent. */
const WINDOW_GAP_MS = 5000;

/**
 * Kickoffs grouped into poll windows: one cycle at `kickoff + 6 h` covers every
 * game from that kickoff to 15 min after it. A window is the cycle's `now`; it
 * reaches back 6 h and forward 15 min.
 */
export function pollWindows(kickoffs: number[]): number[] {
  const windows: number[] = [];
  for (const k of [...new Set(kickoffs)].sort((a, b) => a - b)) if (!windows.length || k > windows.at(-1)! + PREGAME_MS) windows.push(k + MAX_GAME_MS);
  return windows;
}

/**
 * Re-reads games after a fix from the admin site, since the poller has left
 * finished ones behind for good. In the background, one batch at a time: a
 * market can sit on dozens of past games. Writes the same progress rows as the
 * poller, so notifications and settlement behave as they always do.
 */
export class GameRefresher {
  private readonly waiting = new Set<string>();
  private running = 0;
  private errors: string[] = [];
  private draining = false;

  constructor(
    private readonly db: Db,
    private readonly provider: SportsDataProvider,
    private readonly gapMs = WINDOW_GAP_MS,
  ) {}

  add(eventIds: string[]) {
    if (eventIds.length === 0) return;
    if (!this.draining) this.errors = [];
    for (const id of eventIds) this.waiting.add(id);
    if (!this.draining) void this.drain();
  }

  status() {
    return { games: this.waiting.size + this.running, errors: this.errors };
  }

  private async drain() {
    this.draining = true;
    while (this.waiting.size) {
      const events = new Set(this.waiting);
      this.waiting.clear();
      this.running = events.size;
      try {
        await this.replay(events);
      } catch (err) {
        this.errors.push(err instanceof Error ? err.message : String(err));
      }
      this.running = 0;
    }
    this.draining = false;
    if (this.errors.length) console.warn(`[refresh] ${this.errors.join('; ')}`);
  }

  private async replay(events: Set<string>) {
    const now = new Date();
    const legs = await this.db.betLeg.findMany({ where: { eventId: { in: [...events] }, eventStartAt: { lte: now } }, select: { eventStartAt: true } });
    const windows = pollWindows(legs.map((l) => l.eventStartAt!.getTime()));
    for (const [i, w] of windows.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, this.gapMs));
      const report = await runPollCycle(this.db, this.provider, new Date(w), { refetchFinal: events, onlyEvents: events });
      this.errors.push(...report.errors);
    }
  }
}
