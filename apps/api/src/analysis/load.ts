import type { ProviderTeam } from '@sports-better/sports-data';
import type { Db } from '../db';
import { loadEventStates, moneylineSideOf } from '../views/betsView';
import { computeAnalysis, type AnalysisCoupon } from './compute';
import type { Analysis } from './types';

export async function loadAnalysis(db: Db, opts: { userId: string; fundingMaxOdds?: number }): Promise<Analysis> {
  const coupons = await db.coupon.findMany({
    where: { sportsbookAccount: { userId: opts.userId } },
    omit: { rawPayload: true },
    include: {
      bets: true,
      legs: { orderBy: { externalRowIndex: 'asc' }, include: { selections: { omit: { rawOutcome: true, rawBetOffer: true }, include: { progress: true } } } },
    },
  });
  const states = await loadEventStates(db, coupons.flatMap((c) => c.legs.map((l) => l.eventId)).filter((e): e is string => !!e));

  const input: AnalysisCoupon[] = coupons.map((c) => ({
    id: c.id,
    status: c.status,
    rewardType: c.rewardType,
    placedAt: c.placedAt,
    stakeMinor: c.totalStakeMinor ?? 0,
    payoutMinor: c.actualPayoutMinor ?? 0,
    potentialPayoutMinor: c.potentialPayoutMinor,
    oddsRaw: c.bets[0]?.oddsRaw ?? null,
    legs: c.legs.map((l) => {
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
  }));
  return computeAnalysis(input, new Date(), opts.fundingMaxOdds);
}
