import type { ParsedCoupon } from '@sports-better/kambi';
import { classifyMarket, gameMarket } from '@sports-better/markets';
import type { Db } from '../db';
import { printable } from '../printable';

export interface UntrackedSeen {
  sport: string;
  marketName: string;
  reason: string;
  example: string | null;
}

/** The picks on a coupon whose market the tracker can't follow, one per sport + market name. */
export function untrackedIn(parsed: ParsedCoupon): UntrackedSeen[] {
  const found = new Map<string, UntrackedSeen>();
  for (const leg of parsed.bets.flatMap((b) => b.legs)) {
    for (const s of leg.selections) {
      if (!s.marketName || gameMarket(s.marketName)) continue;
      const cls = classifyMarket({ sport: leg.sport, marketName: s.marketName, selectionSide: s.selectionSide, line: s.lineRaw === null ? null : s.lineRaw / 1000 });
      if (cls.supported) continue;
      const sport = leg.sport ?? '';
      const example = [s.participantName, s.selectionLabel].filter(Boolean).join(' · ') || null;
      found.set(`${sport}|${s.marketName}`, { sport, marketName: s.marketName, reason: cls.reason, example });
    }
  }
  return [...found.values()];
}

/**
 * Flags markets the tracker doesn't follow. A market seen for the first time
 * gets a row and a log line ("npm run deploy:logs" shows it); one seen before
 * only has its last-seen time moved. Returns the new ones.
 */
export async function flagUntracked(db: Db, seen: UntrackedSeen[], now = new Date()): Promise<UntrackedSeen[]> {
  if (seen.length === 0) return [];
  const known = await db.untrackedMarket.findMany({
    where: { OR: seen.map((m) => ({ sport: m.sport, marketName: m.marketName })) },
    select: { id: true, sport: true, marketName: true },
  });
  const isKnown = (m: UntrackedSeen) => known.some((k) => k.sport === m.sport && k.marketName === m.marketName);
  const fresh = seen.filter((m) => !isKnown(m));
  if (known.length) await db.untrackedMarket.updateMany({ where: { id: { in: known.map((k) => k.id) } }, data: { lastSeenAt: now } });
  if (fresh.length) {
    // Two syncs can discover the same market at once; the unique key keeps one.
    await db.untrackedMarket.createMany({ data: fresh.map((m) => ({ ...m, firstSeenAt: now, lastSeenAt: now })), skipDuplicates: true });
    for (const m of fresh) console.warn(`[untracked-market] ${printable(m.sport) || '(no sport)'} "${printable(m.marketName)}" (${m.reason})${m.example ? ` e.g. ${printable(m.example)}` : ''}`);
  }
  return fresh;
}
