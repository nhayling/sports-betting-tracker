import type { MarketRule, MarketRules } from '@sports-better/markets';
import type { StatKey } from '@sports-better/sports-data';
import type { Db } from '../db';

/** The markets added from the admin site, for classifyMarket. */
export async function loadMarketRules(db: Db): Promise<MarketRules> {
  const rows = await db.marketRule.findMany({ select: { sport: true, pattern: true, metric: true, scope: true } });
  return new Map(rows.map((r) => [`${r.sport}|${r.pattern}`, { metric: r.metric as StatKey, scope: r.scope as MarketRule['scope'] }]));
}
