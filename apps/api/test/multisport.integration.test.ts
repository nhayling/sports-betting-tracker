import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { pickState } from '@sports-better/display';
import type { RawCoupon } from '@sports-better/kambi';
import { EspnProvider, ProviderError } from '@sports-better/sports-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearRosterCache, runPollCycle } from '../src/live/pollCycle';
import { syncCoupons } from '../src/sync/syncCoupons';
import { loadBetsView } from '../src/views/betsView';
import type { GameView } from '../src/views/betsViewTypes';
import { createTestUser, hasTestDb, setupTestDb } from './testDb';

const fixture = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../packages/sports-data/fixtures/espn/${name}.json`, import.meta.url)), 'utf8'));

/** ESPN from final-game fixtures (captured 2026-10-23). */
function fakeEspn() {
  const routes: Array<[RegExp, string]> = [
    [/soccer\/eng\.1\/scoreboard\?dates=20261018/, 'epl-scoreboard-2026-10-18'],
    [/soccer\/eng\.1\/summary\?event=401879261$/, 'epl-summary-cry-bha-final'],
    [/hockey\/nhl\/scoreboard\?dates=20261022/, 'nhl-scoreboard-2026-10-22'],
    [/hockey\/nhl\/summary\?event=401892553$/, 'nhl-summary-nyr-tor-final'],
    [/hockey\/nhl\/teams\/21\/roster/, 'nhl-roster-tor'],
    [/hockey\/nhl\/teams\/13\/roster/, 'nhl-roster-nyr'],
    [/baseball\/mlb\/scoreboard\?dates=20261019/, 'mlb-scoreboard-2026-10-19'],
    [/baseball\/mlb\/summary\?event=401908028$/, 'mlb-summary-cle-tb-final'],
    [/baseball\/mlb\/teams\/30\/roster/, 'mlb-roster-tb'],
    [/baseball\/mlb\/teams\/5\/roster/, 'mlb-roster-cle'],
    [/mma\/ufc\/scoreboard\?dates=20261017/, 'ufc-scoreboard-2026-10-17'],
  ];
  const urls: string[] = [];
  const provider = new EspnProvider(async (url) => {
    urls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) throw new ProviderError('NOT_FOUND', `no fixture for ${url}`);
    return fixture(hit[1]);
  });
  return { provider, urls };
}

interface Pick {
  label: string;
  criterion: string;
  line?: number;
  participantId?: number;
}

let ref = 992000000;
/** One bet on one game, shaped like Island Luck's coupon history. */
function coupon(event: Record<string, unknown>, picks: Pick[]): RawCoupon {
  const couponRef = ++ref;
  return {
    couponRef,
    placedDate: '2026-10-01T12:00:00Z',
    currency: 'USD',
    bets: [{ betRef: couponRef + 1, stake: 5000, playedOdds: 5000, betOdds: 5000, potentialPayout: 25000, betStatus: 'OPEN', couponRowIndexes: picks.map((_, i) => i) }],
    couponRows: picks.map((_, i) => ({ index: i, selectionType: 'SIMPLE', outcomeId: couponRef * 10 + i, playedOdds: 1500, status: 'OPEN' })),
    outcomes: picks.map((p, i) => ({
      outcomeId: couponRef * 10 + i,
      betOfferId: couponRef * 100 + i,
      eventId: event.eventId,
      label: p.label,
      ...(p.line !== undefined ? { line: p.line } : {}),
      ...(p.participantId !== undefined ? { participantId: p.participantId } : {}),
      status: 'OPEN',
    })),
    betOffers: picks.map((p, i) => ({ betOfferId: couponRef * 100 + i, criterion: p.criterion, boType: 'x', boTypeId: 0, ...(p.line !== undefined ? { line: p.line } : {}) })),
    events: [event],
  } as unknown as RawCoupon;
}

const MLB_SUFFIX = ' - Including Extra Innings (Listed player must be in starting lineup for bets to stand)';

describe.skipIf(!hasTestDb)('MLB, NHL, soccer and UFC bets end to end', () => {
  let db: PrismaClient;
  let userId: string;
  const games = new Map<string, GameView>();
  const pick = (game: string, criterion: string, name?: string) => {
    const g = games.get(game)!;
    const p = g.picks.find((x) => x.marketName === criterion && (name === undefined || x.participantName === name));
    if (!p) throw new Error(`no ${criterion} ${name ?? ''} in ${game}: ${g.picks.map((x) => `${x.marketName}/${x.participantName}`).join(', ')}`);
    return { ...p, state: pickState(p, g) };
  };

  beforeAll(async () => {
    db = await setupTestDb();
    userId = (await createTestUser(db, 'noah')).id;
    clearRosterCache();
    await syncCoupons(db, {
      userId,
      accountLabel: 'Island Luck',
      capturedAt: new Date('2026-10-01T12:00:00Z'),
      coupons: [
        coupon(
          { eventId: 1029000001, eventName: 'Brighton - Crystal Palace', homeName: 'Brighton', awayName: 'Crystal Palace', sport: 'FOOTBALL', eventGroups: [{ name: 'Soccer' }, { name: 'England' }, { name: 'Premier League' }], eventStartDate: '2026-10-18T13:00:00Z' },
          [
            { label: '1', criterion: 'Full Time', participantId: 1000000101 },
            { label: 'X', criterion: 'Full Time' },
            { label: 'No', criterion: 'Both Teams To Score' },
            { label: 'Over 2.5', criterion: 'Total Goals', line: 2500 },
            { label: 'Charalambos Kostoulas - Yes', criterion: 'To Score', line: 1000, participantId: 1000000102 },
            { label: 'Over 9.5', criterion: 'Total Corners', line: 9500 },
          ],
        ),
        coupon(
          { eventId: 1029000002, eventName: 'NY Rangers @ TOR Maple Leafs', homeName: 'TOR Maple Leafs', awayName: 'NY Rangers', sport: 'ICE_HOCKEY', eventGroups: [{ name: 'Ice Hockey' }, { name: 'NHL' }], eventStartDate: '2026-10-22T23:00:00Z' },
          [
            { label: 'NY Rangers +1.5', criterion: 'Puck Line - Inc. OT and Shootout', line: 1500, participantId: 1000000201 },
            { label: 'Mika Zibanejad - Yes', criterion: 'Player to score at least 2 points - Including Overtime', line: 2000, participantId: 1000000202 },
            { label: 'Adam Fox - Over 1.5', criterion: "Player's shots on goal - Including Overtime", line: 1500, participantId: 1000000203 },
          ],
        ),
        coupon(
          { eventId: 1029000003, eventName: 'CLE Guardians @ TB Rays', homeName: 'TB Rays', awayName: 'CLE Guardians', sport: 'BASEBALL', eventGroups: [{ name: 'Baseball' }, { name: 'MLB' }], eventStartDate: '2026-10-20T00:05:00Z' },
          [
            { label: 'TB Rays -1.5', criterion: 'Run Line', line: -1500, participantId: 1000000301 },
            { label: 'Junior Caminero - Yes', criterion: `Player to Hit a Home Run${MLB_SUFFIX}`, line: 1000, participantId: 1000000302 },
            { label: 'Freddy Peralta - Over 4.5', criterion: `Total Strikeouts by the Player${MLB_SUFFIX}`, line: 4500, participantId: 1000000303 },
          ],
        ),
        coupon(
          { eventId: 1029000004, eventName: 'Javad Mahjoub - Joel Faglier', homeName: 'Javad Mahjoub', awayName: 'Joel Faglier', sport: 'MARTIAL_ARTS', eventGroups: [{ name: 'UFC/MMA' }, { name: 'UFC' }], eventStartDate: '2026-10-17T23:30:00Z' },
          [
            { label: '2', criterion: 'Bout Odds', participantId: 1000000401 },
            { label: 'Over 1.5', criterion: 'Total Rounds', line: 1500 },
            { label: 'Yes', criterion: 'Joel Faglier to win by Finish' },
            { label: 'Yes', criterion: 'To go the distance' },
          ],
        ),
      ],
    });

    // Each game polled a few hours after it started, once it's final.
    const { provider } = fakeEspn();
    for (const at of ['2026-10-18T16:00:00Z', '2026-10-23T02:00:00Z', '2026-10-20T03:00:00Z', '2026-10-18T02:00:00Z']) {
      const r = await runPollCycle(db, provider, new Date(at));
      expect(r.errors).toEqual([]);
      expect(r.eventsUnmatched).toEqual([]);
    }
    const view = await loadBetsView(db, { userId, view: 'open', limit: 50 });
    for (const c of view.coupons) for (const g of c.games) games.set(g.name!, g);
  }, 60_000);
  afterAll(() => db?.$disconnect());

  it('soccer: three-way result, both teams to score, goals, a scorer and corners (BHA 5–0 CRY)', () => {
    const g = 'Brighton - Crystal Palace';
    expect(games.get(g)!.state).toMatchObject({ state: 'FINAL', homeScore: 5, awayScore: 0 });
    expect(pick(g, 'Full Time', 'Brighton')).toMatchObject({ type: 'RESULT', moneylineSide: 'home', state: 'hit' });
    expect(pick(g, 'Full Time', 'Draw')).toMatchObject({ type: 'RESULT', moneylineSide: 'draw', state: 'missed' });
    expect(pick(g, 'Both Teams To Score')).toMatchObject({ type: 'BTTS', selectionSide: 'NO', participantName: 'Both teams to score', state: 'hit' });
    expect(pick(g, 'Total Goals')).toMatchObject({ type: 'TOTAL', state: 'hit' });
    expect(pick(g, 'To Score')).toMatchObject({ type: 'STAT', display: 'BINARY', progress: { metric: 'GOALS', status: 'FINAL_HIT', current: 1 } });
    expect(pick(g, 'Total Corners')).toMatchObject({ progress: { metric: 'CORNERS', status: 'FINAL_HIT', current: 13 } });
  });

  it('NHL: puck line and skater props (TOR 5–4 NYR)', () => {
    const g = 'NY Rangers @ TOR Maple Leafs';
    expect(pick(g, 'Puck Line - Inc. OT and Shootout')).toMatchObject({ type: 'SPREAD', moneylineSide: 'away', line: 1.5, state: 'hit' });
    expect(pick(g, 'Player to score at least 2 points - Including Overtime')).toMatchObject({ progress: { metric: 'POINTS', status: 'FINAL_HIT', current: 2 } });
    expect(pick(g, "Player's shots on goal - Including Overtime")).toMatchObject({ progress: { metric: 'SHOTS_ON_GOAL', status: 'FINAL_MISSED', current: 0 } });
  });

  it('MLB: run line, a home run and pitcher strikeouts (TB 7–3 CLE)', () => {
    const g = 'CLE Guardians @ TB Rays';
    expect(pick(g, 'Run Line')).toMatchObject({ type: 'SPREAD', moneylineSide: 'home', line: -1.5, state: 'hit' });
    expect(pick(g, `Player to Hit a Home Run${MLB_SUFFIX}`)).toMatchObject({ display: 'BINARY', progress: { metric: 'HOME_RUNS', status: 'FINAL_HIT', current: 1 } });
    expect(pick(g, `Total Strikeouts by the Player${MLB_SUFFIX}`)).toMatchObject({ progress: { metric: 'PITCHER_STRIKEOUTS', status: 'FINAL_MISSED', current: 3 } });
  });

  it('UFC: graded from how the bout ended (Faglier by KO, 2:11 of round 2)', () => {
    const g = 'Javad Mahjoub - Joel Faglier';
    expect(games.get(g)!.state!.fight).toMatchObject({ winner: 'away', method: 'KO_TKO', round: 2 });
    expect(pick(g, 'Bout Odds')).toMatchObject({ type: 'FIGHT', participantName: 'Joel Faglier', fightGrade: 1, state: 'hit' });
    expect(pick(g, 'Total Rounds')).toMatchObject({ fightGrade: -1, participantName: null, state: 'missed' });
    expect(pick(g, 'Joel Faglier to win by Finish')).toMatchObject({ participantName: 'Joel Faglier', fightGrade: 1, state: 'hit' });
    expect(pick(g, 'To go the distance')).toMatchObject({ fightGrade: -1, state: 'missed' });
  });
});
