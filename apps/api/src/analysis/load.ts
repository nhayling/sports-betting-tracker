import type { ProviderTeam } from '@sports-better/sports-data';
import type { Db } from '../db';
import { betsOfCoupon, loadEventStates, moneylineSideOf } from '../views/betsView';
import { computeAnalysis, type AnalysisCoupon } from './compute';
import type { Analysis } from './types';
import type { Period } from '../social/types';
import { inPeriod } from '../social/units';

export async function loadAnalysis(db: Db, opts: { userId: string; fundingMaxOdds?: number; period?: Period }, now = new Date()): Promise<Analysis> {
  const period = opts.period ?? 'all';
  const coupons = await db.coupon.findMany({
    where: { sportsbookAccount: { userId: opts.userId } },
    omit: { rawPayload: true },
    include: {
      bets: { include: { legs: { select: { betLegId: true } } } },
      legs: { orderBy: { externalRowIndex: 'asc' }, include: { selections: { omit: { rawOutcome: true, rawBetOffer: true }, include: { progress: true } } } },
    },
  });
  const inRange = coupons.filter((c) => inPeriod(c.placedAt, period, now));
  const states = await loadEventStates(db, inRange.flatMap((c) => c.legs.map((l) => l.eventId)).filter((e): e is string => !!e));

  // Each bet on a coupon is its own bet here, as in the bet list.
  const input: AnalysisCoupon[] = inRange.flatMap((c) => betsOfCoupon(c).map((b) => ({
    id: b.id,
    status: b.status,
    rewardType: c.rewardType,
    placedAt: c.placedAt,
    stakeMinor: b.stakeMinor ?? 0,
    payoutMinor: b.payoutMinor ?? 0,
    potentialPayoutMinor: b.potentialPayoutMinor,
    oddsRaw: b.oddsRaw,
    legs: b.legs.map((l) => {
      const st = l.eventId ? states.get(l.eventId) : undefined;
      return {
        selectionType: l.selectionType,
        oddsRaw: l.oddsRaw,
        sport: l.sport,
        league: l.league,
        eventName: l.eventName,
        game: st ? { state: st.state, homeScore: st.homeScore, awayScore: st.awayScore } : null,
        selections: l.selections.map((s) => ({
          status: s.status,
          marketName: s.marketName,
          participantName: s.participantName,
          participantId: s.externalParticipantId,
          selectionSide: s.selectionSide,
          line: s.lineRaw === null ? null : s.lineRaw / 1000,
          moneylineSide: st ? moneylineSideOf(l.league, s.participantName, st.homeTeam as unknown as ProviderTeam, st.awayTeam as unknown as ProviderTeam) : null,
          progress: s.progress
            ? { status: s.progress.status, current: s.progress.currentValue, target: s.progress.target, operator: s.progress.operator, metric: s.progress.metric }
            : null,
        })),
      };
    }),
  })));
  return { ...computeAnalysis(input, now, opts.fundingMaxOdds), period };
}
