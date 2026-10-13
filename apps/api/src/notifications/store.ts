import type { Db } from '../db';
import { loadBetsView } from '../views/betsView';
import { notificationEvents } from './generate';

/**
 * Records new notification events. Safe to run every poll cycle: the unique
 * dedupe key means an event is stored once. Each user gets notifications for
 * their own open bets only. Returns how many were new.
 *
 * Delivery: only the in-app feed for now. An external channel (web push,
 * Telegram, ntfy…) would send rows where deliveredAt is null and set it.
 */
export async function recordNotifications(db: Db): Promise<number> {
  const owners = await db.sportsbookAccount.findMany({
    where: { coupons: { some: { status: 'OPEN' } } },
    select: { userId: true },
    distinct: ['userId'],
  });
  let created = 0;
  for (const { userId } of owners) {
    const view = await loadBetsView(db, { userId, view: 'open', limit: 500 });
    const events = notificationEvents(view);
    if (events.length === 0) continue;
    const { count } = await db.notification.createMany({ data: events.map((e) => ({ ...e, userId })), skipDuplicates: true });
    created += count;
  }
  return created;
}
