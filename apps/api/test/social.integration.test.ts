import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import type { RawHistoryResponse } from '@sports-better/kambi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import captured from '../../../packages/kambi/fixtures/captured/history-2026-09-27.json';
import { createApp } from '../src/app';
import { createSession } from '../src/auth/sessions';
import type { LeaderboardView, Person, ProfileView, SocialMe } from '../src/social/types';
import { syncCoupons } from '../src/sync/syncCoupons';
import type { BetsView } from '../src/views/betsViewTypes';
import { createTestUser, hasTestDb, setupTestDb } from './testDb';

/**
 * noah has the real captured bets (all $5 stakes). buddy has three made-up
 * $100 bets this week. carol and dave have none.
 */
describe.skipIf(!hasTestDb)('social against Postgres', () => {
  let db: PrismaClient;
  let base: string;
  let close: () => void;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    db = await setupTestDb();
    const now = new Date();
    for (const name of ['noah', 'buddy', 'carol', 'dave']) {
      const user = await createTestUser(db, name);
      cookies[name] = `sb_session=${(await createSession(db, user.id, 'test')).token}`;
      if (name === 'noah') {
        await syncCoupons(db, { userId: user.id, accountLabel: 'Island Luck', capturedAt: now, coupons: (captured as unknown as RawHistoryResponse).coupons! });
      }
      if (name === 'buddy') {
        const account = await db.sportsbookAccount.create({ data: { userId: user.id, provider: 'ISLAND_LUCK_KAMBI', label: 'Island Luck' } });
        // +300 won, a loss, -200 won: 3 − 1 + 0.5 = +2.5u, and +$250 on $300 staked.
        const bets: Array<[string, number, number]> = [
          ['WON', 4000, 40_000],
          ['LOST', 12_870, 0],
          ['WON', 1500, 15_000],
        ];
        for (const [i, [status, oddsRaw, payout]] of bets.entries()) {
          await db.coupon.create({
            data: {
              sportsbookAccountId: account.id,
              externalCouponRef: `buddy-${i}`,
              // Spaced a second apart so they list newest first in a known order.
              placedAt: new Date(now.getTime() - i * 1000),
              currency: 'BSD',
              status: status as 'WON' | 'LOST',
              totalStakeMinor: 10_000,
              potentialPayoutMinor: oddsRaw * 10,
              actualPayoutMinor: payout,
              rawPayload: {},
              rawPayloadHash: `buddy-${i}`,
              parserVersion: 1,
              capturedAt: now,
              lastSyncedAt: now,
              bets: {
                create: [{ externalBetRef: `buddy-${i}`, kind: 'COMBINATION', oddsRaw, stakeMinor: 10_000, potentialPayoutMinor: oddsRaw * 10, potentialPayoutDerived: false, payoutMinor: payout, status: status as 'WON' | 'LOST' }],
              },
            },
          });
        }
      }
    }

    const server = createApp(db).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  }, 60_000);
  afterAll(async () => {
    close?.();
    await db?.$disconnect();
  });

  const call = (as: string | null, method: string, path: string, body?: unknown) =>
    fetch(`${base}/api/social${path}`, {
      method,
      headers: { ...(as ? { cookie: cookies[as]! } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const json = async <T>(as: string, method: string, path: string, body?: unknown) => {
    const res = await call(as, method, path, body);
    expect(res.status, `${method} ${path} as ${as}`).toBe(200);
    return (await res.json()) as T;
  };
  const relation = async (as: string, method: string, path: string) => (await json<{ relation: Person['relation'] }>(as, method, path)).relation;
  const betsOf = (as: string, whose: string, view = 'settled') => call(as, 'GET', `/profiles/${whose}/bets?view=${view}`);
  const seen = async (as: string, whose: string) => {
    const res = await betsOf(as, whose);
    expect(res.status, `${whose}'s bets as ${as}`).toBe(200);
    return (await res.json()) as BetsView;
  };
  const stakes = (v: BetsView) => v.coupons.map((c) => c.stakeMinor);
  /** buddy's three $100 bets restated at the $5 minimum: stake, would pay, paid. */
  const BUDDY_AT_MINIMUM = [
    [500, 2000, 2000],
    [500, 6435, 0],
    [500, 750, 750],
  ];
  const money = (v: BetsView) => v.coupons.map((c) => [c.stakeMinor, c.potentialPayoutMinor, c.payoutMinor]);

  it('needs a sign-in', async () => {
    expect((await call(null, 'GET', '/leaderboard')).status).toBe(401);
    expect((await call(null, 'GET', '/profiles/noah/bets')).status).toBe(401);
  });

  it('starts private: a stranger sees a record in units but no bets', async () => {
    const profile = await json<ProfileView>('buddy', 'GET', '/profiles/noah');
    expect(profile).toMatchObject({ username: 'noah', isYou: false, canSeeBets: false, canSeeAmounts: false, counts: { friends: 0, followers: 0, following: 0 } });
    expect(profile.stats!.all).toMatchObject({ bets: 9, lost: 8, other: 1, units: -8.05 });
    expect((await betsOf('buddy', 'noah')).status).toBe(403);
    expect((await betsOf('buddy', 'noah', 'open')).status).toBe(403);
    // Nothing in the profile itself carries an amount.
    expect(JSON.stringify(profile)).not.toMatch(/Minor/);
  });

  it('shows you your own bets in full', async () => {
    const mine = await seen('noah', 'noah');
    expect(mine.minBetMinor).toBeUndefined();
    expect(mine.coupons).toHaveLength(9);
    expect(mine.coupons.every((c) => c.stakeMinor === 500 && c.externalCouponRef !== '')).toBe(true);
    expect(await json<ProfileView>('noah', 'GET', '/profiles/noah')).toMatchObject({ isYou: true, canSeeBets: true, canSeeAmounts: true });
  });

  it('makes friends by request and acceptance, then shows bets at the minimum stake', async () => {
    expect(await relation('buddy', 'POST', '/friends/noah')).toMatchObject({ friend: 'SENT' });
    // Asking again changes nothing, and a pending request opens nothing.
    expect(await relation('buddy', 'POST', '/friends/noah')).toMatchObject({ friend: 'SENT' });
    expect(await db.friendship.count()).toBe(1);
    expect((await betsOf('buddy', 'noah')).status).toBe(403);
    expect((await betsOf('noah', 'buddy')).status).toBe(403);

    expect((await json<SocialMe>('noah', 'GET', '/me')).pendingRequests).toBe(1);
    const { people } = await json<{ people: Person[] }>('noah', 'GET', '/people');
    // Only people you have a tie with; everyone else is found by searching.
    expect(people.map((p) => p.username)).toEqual(['buddy']);
    expect(people[0]).toEqual({ username: 'buddy', displayName: null, locked: false, relation: { friend: 'RECEIVED', following: 'NONE', followsYou: 'NONE' } });
    const search = async (q: string) => (await json<{ people: Person[] }>('noah', 'GET', `/people?q=${encodeURIComponent(q)}`)).people;
    expect((await search('CAR')).map((p) => p.username)).toEqual(['carol']);
    expect((await search('@dav'))[0]).toMatchObject({ username: 'dave', relation: { friend: 'NONE', following: 'NONE', followsYou: 'NONE' } });
    expect((await search('bud'))[0]!.relation.friend).toBe('RECEIVED');
    // You never find yourself.
    expect(await search('noah')).toEqual([]);

    // Accepting is asking back.
    expect(await relation('noah', 'POST', '/friends/buddy')).toMatchObject({ friend: 'FRIENDS' });
    expect(await db.friendship.count()).toBe(1);
    expect((await json<SocialMe>('noah', 'GET', '/me')).pendingRequests).toBe(0);

    // buddy stakes $100 a bet. noah sees each one as a $5 bet, and is told so.
    const theirs = await seen('noah', 'buddy');
    expect(theirs.minBetMinor).toBe(500);
    expect(money(theirs)).toEqual(BUDDY_AT_MINIMUM);
    expect(JSON.stringify(theirs)).not.toMatch(/10000|40000|128700|15000/);
    expect(theirs.coupons.every((c) => c.externalCouponRef === '' && c.probablySettled === null)).toBe(true);

    // Friendship goes both ways. Picks, odds and results are what a friend does see.
    const noahs = await seen('buddy', 'noah');
    expect(noahs.minBetMinor).toBe(500);
    expect(noahs.coupons).toHaveLength(9);
    expect(noahs.coupons.every((c) => c.oddsRaw !== null && c.pickCount > 0 && c.games.length > 0 && c.externalCouponRef === '')).toBe(true);
  });

  it('shares real amounts with friends only once that switch is on', async () => {
    await json('buddy', 'PATCH', '/settings', { shareAmountsFriends: true });
    const theirs = await seen('noah', 'buddy');
    expect(theirs.minBetMinor).toBeUndefined();
    expect(stakes(theirs)).toEqual([10_000, 10_000, 10_000]);
    expect(theirs.coupons.map((c) => c.payoutMinor)).toEqual([40_000, 0, 15_000]);
    // Still not Island Luck's reference for the bet.
    expect(theirs.coupons.every((c) => c.externalCouponRef === '')).toBe(true);
    expect(await json<ProfileView>('noah', 'GET', '/profiles/buddy')).toMatchObject({ canSeeBets: true, canSeeAmounts: true, relation: { friend: 'FRIENDS' } });
  });

  it('lets anyone follow an open account without approval, one way, under the followers switch', async () => {
    expect((await json<ProfileView>('carol', 'GET', '/profiles/buddy')).locked).toBe(false);
    expect(await relation('carol', 'POST', '/follows/buddy')).toEqual({ friend: 'NONE', following: 'FOLLOWING', followsYou: 'NONE' });
    // Nothing for buddy to answer, and following twice is still one follow.
    expect((await json<SocialMe>('buddy', 'GET', '/me')).pendingRequests).toBe(0);
    await relation('carol', 'POST', '/follows/buddy');
    expect(await db.follow.count()).toBe(1);
    expect((await json<{ people: Person[] }>('buddy', 'GET', '/people')).people.find((p) => p.username === 'carol')!.relation).toEqual({
      friend: 'NONE',
      following: 'NONE',
      followsYou: 'FOLLOWING',
    });

    // buddy shares amounts with friends; followers have their own switch, still off.
    const theirs = await seen('carol', 'buddy');
    expect(theirs.minBetMinor).toBe(500);
    expect(money(theirs)).toEqual(BUDDY_AT_MINIMUM);
    expect(await json<ProfileView>('carol', 'GET', '/profiles/buddy')).toMatchObject({ canSeeBets: true, canSeeAmounts: false, counts: { friends: 1, followers: 1, following: 0 } });
    // One-way: buddy can't see carol's bets.
    expect((await betsOf('buddy', 'carol')).status).toBe(403);

    await json('buddy', 'PATCH', '/settings', { shareAmountsFollowers: true });
    expect(stakes(await seen('carol', 'buddy'))).toEqual([10_000, 10_000, 10_000]);

    // Nothing was waiting on an open account, so there is nothing to approve.
    expect((await call('buddy', 'POST', '/followers/carol')).status).toBe(404);
    expect(await db.follow.count()).toBe(1);
  });

  it('makes followers ask first on a locked account', async () => {
    expect(await json('dave', 'PATCH', '/settings', { locked: true })).toMatchObject({ locked: true });
    expect(await json<ProfileView>('carol', 'GET', '/profiles/dave')).toMatchObject({ locked: true, canSeeBets: false });

    // A request opens nothing, and isn't counted as a follower.
    expect(await relation('carol', 'POST', '/follows/dave')).toEqual({ friend: 'NONE', following: 'REQUESTED', followsYou: 'NONE' });
    const refused = await betsOf('carol', 'dave');
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toMatch(/locked/);
    expect((await json<SocialMe>('dave', 'GET', '/me')).pendingRequests).toBe(1);
    expect((await json<ProfileView>('dave', 'GET', '/profiles/dave')).counts.followers).toBe(0);
    expect((await json<{ people: Person[] }>('dave', 'GET', '/people')).people.find((p) => p.username === 'carol')!.relation.followsYou).toBe('REQUESTED');
    expect((await json<{ people: Person[] }>('carol', 'GET', '/people')).people.find((p) => p.username === 'dave')).toMatchObject({ locked: true });

    // Approving lets them in.
    expect(await relation('dave', 'POST', '/followers/carol')).toMatchObject({ followsYou: 'FOLLOWING' });
    expect((await betsOf('carol', 'dave')).status).toBe(200);
    expect((await json<SocialMe>('dave', 'GET', '/me')).pendingRequests).toBe(0);
    expect((await json<ProfileView>('dave', 'GET', '/profiles/dave')).counts.followers).toBe(1);

    // Removing a follower shuts them out, and on a locked account they have to ask again.
    expect(await relation('dave', 'DELETE', '/followers/carol')).toMatchObject({ followsYou: 'NONE' });
    expect((await betsOf('carol', 'dave')).status).toBe(403);
    expect(await relation('carol', 'POST', '/follows/dave')).toMatchObject({ following: 'REQUESTED' });

    // Declining, and cancelling your own request, both just remove it.
    expect(await relation('noah', 'POST', '/follows/dave')).toMatchObject({ following: 'REQUESTED' });
    expect(await relation('dave', 'DELETE', '/followers/noah')).toMatchObject({ followsYou: 'NONE' });
    expect(await relation('noah', 'POST', '/follows/dave')).toMatchObject({ following: 'REQUESTED' });
    expect(await relation('noah', 'DELETE', '/follows/dave')).toMatchObject({ following: 'NONE' });
    expect((await betsOf('noah', 'dave')).status).toBe(403);

    // Opening the account lets in whoever was waiting.
    await json('dave', 'PATCH', '/settings', { locked: false });
    expect((await betsOf('carol', 'dave')).status).toBe(200);
    expect((await json<SocialMe>('dave', 'GET', '/me')).pendingRequests).toBe(0);

    // Locking it again keeps the followers it has; only new ones ask.
    await json('dave', 'PATCH', '/settings', { locked: true });
    expect((await betsOf('carol', 'dave')).status).toBe(200);
    expect(await relation('noah', 'POST', '/follows/dave')).toMatchObject({ following: 'REQUESTED' });
    expect((await betsOf('noah', 'dave')).status).toBe(403);

    // Friends are asked either way, and a locked account's friends get in without following.
    expect(await relation('buddy', 'POST', '/friends/dave')).toMatchObject({ friend: 'SENT', following: 'NONE' });
    expect((await betsOf('buddy', 'dave')).status).toBe(403);
    expect(await relation('dave', 'POST', '/friends/buddy')).toMatchObject({ friend: 'FRIENDS' });
    expect((await betsOf('buddy', 'dave')).status).toBe(200);
    await relation('buddy', 'DELETE', '/friends/dave');
  });

  it('closes access again on unfollowing or unfriending', async () => {
    expect(await relation('carol', 'DELETE', '/follows/buddy')).toMatchObject({ following: 'NONE' });
    expect((await betsOf('carol', 'buddy')).status).toBe(403);

    expect(await relation('buddy', 'DELETE', '/friends/noah')).toMatchObject({ friend: 'NONE' });
    expect((await betsOf('buddy', 'noah')).status).toBe(403);
    expect((await betsOf('noah', 'buddy')).status).toBe(403);
    expect(await db.friendship.count()).toBe(0);
  });

  it('ranks the leaderboard on units and shows dollars only for those who share them', async () => {
    const week = await json<LeaderboardView>('carol', 'GET', '/leaderboard?period=week');
    expect(week).toMatchObject({ period: 'week', minBets: 3 });
    expect(week.rows.map((r) => r.username).sort()).toEqual(['buddy', 'carol', 'dave', 'noah']);
    const buddy = week.rows[0]!;
    expect(buddy).toMatchObject({ username: 'buddy', rank: 1, bets: 3, won: 2, lost: 1, units: 2.5, bestHitOddsRaw: 4000, netMinor: null, isYou: false });
    // noah's bets were placed in September: nothing this week, so no rank.
    expect(week.rows.find((r) => r.username === 'noah')).toMatchObject({ rank: null, bets: 0, units: 0 });
    expect(week.rows.find((r) => r.username === 'carol')).toMatchObject({ isYou: true, rank: null });
    // buddy stakes $100 a bet and noah $5; nothing on the board differs because of it,
    // even though buddy shares amounts with friends and followers.
    expect(JSON.stringify(week)).not.toMatch(/10000|"netMinor":-?\d/);

    await json('buddy', 'PATCH', '/settings', { shareAmountsLeaderboard: true });
    const shared = await json<LeaderboardView>('carol', 'GET', '/leaderboard?period=week');
    expect(shared.rows.find((r) => r.username === 'buddy')!.netMinor).toBe(25_000);
    expect(shared.rows.filter((r) => r.username !== 'buddy').every((r) => r.netMinor === null)).toBe(true);

    const all = await json<LeaderboardView>('carol', 'GET', '/leaderboard?period=all');
    expect(all.minBets).toBe(20);
    expect(all.rows.find((r) => r.username === 'noah')).toMatchObject({ rank: null, bets: 9, units: -8.05 });
    // An unknown period falls back to the week.
    expect((await json<LeaderboardView>('carol', 'GET', '/leaderboard?period=decade')).period).toBe('week');
  });

  it('takes you off the board, and hides your record from strangers, when you opt out', async () => {
    await json('noah', 'PATCH', '/settings', { showOnLeaderboard: false });
    const board = await json<LeaderboardView>('noah', 'GET', '/leaderboard?period=all');
    expect(board.rows.map((r) => r.username)).not.toContain('noah');
    expect((await json<ProfileView>('dave', 'GET', '/profiles/noah')).stats).toBeNull();
    expect((await json<ProfileView>('noah', 'GET', '/profiles/noah')).stats).not.toBeNull();
    // noah's account is open, so following is all it takes to see the record again.
    await relation('dave', 'POST', '/follows/noah');
    expect((await json<ProfileView>('dave', 'GET', '/profiles/noah')).stats).not.toBeNull();
    // On a locked account, asking to follow isn't enough.
    await json('noah', 'PATCH', '/settings', { locked: true });
    expect(await relation('buddy', 'POST', '/follows/noah')).toMatchObject({ following: 'REQUESTED' });
    expect((await json<ProfileView>('buddy', 'GET', '/profiles/noah')).stats).toBeNull();
  });

  it('validates settings and tidies the display name', async () => {
    expect(await json('carol', 'PATCH', '/settings', { displayName: '  Carol   B. ' })).toMatchObject({ displayName: 'Carol B.' });
    expect((await json<ProfileView>('dave', 'GET', '/profiles/carol')).displayName).toBe('Carol B.');
    expect(await json('carol', 'PATCH', '/settings', { displayName: '   ' })).toMatchObject({ displayName: null });

    expect((await call('carol', 'PATCH', '/settings', { displayName: 'x'.repeat(41) })).status).toBe(400);
    expect((await call('carol', 'PATCH', '/settings', { shareAmountsFriends: 'yes' })).status).toBe(400);
    expect((await call('carol', 'PATCH', '/settings', { displayName: 7 })).status).toBe(400);
    // Fields that aren't settings (including the retired follower approval) are ignored, not written.
    await json('carol', 'PATCH', '/settings', { username: 'noah', passwordHash: 'x', approveFollowers: true });
    expect(await db.user.count({ where: { username: 'carol' } })).toBe(1);
    expect((await call('carol', 'PATCH', '/settings', { locked: 'yes' })).status).toBe(400);
    expect((await json<SocialMe>('carol', 'GET', '/me')).settings).toEqual({
      displayName: null,
      locked: false,
      shareAmountsFriends: false,
      shareAmountsFollowers: false,
      shareAmountsLeaderboard: false,
      showOnLeaderboard: true,
    });
  });

  it('rejects yourself and people who do not exist', async () => {
    expect((await call('noah', 'POST', '/friends/noah')).status).toBe(400);
    expect((await call('noah', 'POST', '/follows/noah')).status).toBe(400);
    expect((await call('noah', 'POST', '/friends/nobody')).status).toBe(404);
    expect((await call('noah', 'GET', '/profiles/nobody')).status).toBe(404);
    expect((await call('noah', 'GET', '/profiles/no%20such%20name/bets')).status).toBe(404);
  });
});
