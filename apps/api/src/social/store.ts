import type { Prisma, User } from '@prisma/client';
import type { Db } from '../db';
import { MIN_BETS, type LeaderboardView, type Period, type Person, type ProfileView, type Relation, type SocialSettings } from './types';
import { inPeriod, netMinor, rank, unitStats, type UnitBet } from './units';

/**
 * Who can see what. Friends (always accepted) and followers (approved first
 * only on a locked account) see a person's bets; amounts need that person's
 * switch for the audience; the record in units is as public (to signed-in
 * people) as the leaderboard it appears on.
 */

const STRANGER: Relation = { friend: 'NONE', following: 'NONE', followsYou: 'NONE' };

const FRIEND_ORDER: Relation['friend'][] = ['NONE', 'SENT', 'RECEIVED', 'FRIENDS'];

/** How `viewerId` stands with everyone they have any tie to (or just `otherId`), keyed by the other person's id. */
export async function relationsOf(db: Db, viewerId: string, otherId?: string): Promise<Map<string, Relation>> {
  const [friendships, follows] = await Promise.all([
    db.friendship.findMany({
      where: otherId
        ? { OR: [{ requesterId: viewerId, addresseeId: otherId }, { requesterId: otherId, addresseeId: viewerId }] }
        : { OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] },
    }),
    db.follow.findMany({
      where: otherId
        ? { OR: [{ followerId: viewerId, followeeId: otherId }, { followerId: otherId, followeeId: viewerId }] }
        : { OR: [{ followerId: viewerId }, { followeeId: viewerId }] },
    }),
  ]);
  const map = new Map<string, Relation>();
  const of = (id: string) => {
    let r = map.get(id);
    if (!r) map.set(id, (r = { ...STRANGER }));
    return r;
  };
  for (const f of friendships) {
    const mine = f.requesterId === viewerId;
    const r = of(mine ? f.addresseeId : f.requesterId);
    // Two people can ask each other at the same moment; the stronger state wins.
    const next = f.status === 'ACCEPTED' ? 'FRIENDS' : mine ? 'SENT' : 'RECEIVED';
    if (FRIEND_ORDER.indexOf(next) > FRIEND_ORDER.indexOf(r.friend)) r.friend = next;
  }
  for (const f of follows) {
    const state = f.status === 'ACCEPTED' ? 'FOLLOWING' : 'REQUESTED';
    if (f.followerId === viewerId) of(f.followeeId).following = state;
    else of(f.followerId).followsYou = state;
  }
  return map;
}

export async function relationWith(db: Db, viewerId: string, otherId: string): Promise<Relation> {
  return (await relationsOf(db, viewerId, otherId)).get(otherId) ?? { ...STRANGER };
}

export interface Access {
  stats: boolean;
  bets: boolean;
  amounts: boolean;
}

export function accessTo(
  target: Pick<User, 'id' | 'shareAmountsFriends' | 'shareAmountsFollowers' | 'showOnLeaderboard'>,
  viewerId: string,
  rel: Relation,
): Access {
  if (target.id === viewerId) return { stats: true, bets: true, amounts: true };
  const friend = rel.friend === 'FRIENDS';
  // A follow request a locked account hasn't approved opens nothing.
  const follower = rel.following === 'FOLLOWING';
  return {
    bets: friend || follower,
    // The record in units is what the leaderboard already shows.
    stats: friend || follower || target.showOnLeaderboard,
    amounts: (friend && target.shareAmountsFriends) || (follower && target.shareAmountsFollowers),
  };
}

export const settingsOf = (u: User): SocialSettings => ({
  displayName: u.displayName,
  locked: u.locked,
  shareAmountsFriends: u.shareAmountsFriends,
  shareAmountsFollowers: u.shareAmountsFollowers,
  shareAmountsLeaderboard: u.shareAmountsLeaderboard,
  showOnLeaderboard: u.showOnLeaderboard,
});

export async function updateSettings(db: Db, userId: string, changes: Partial<SocialSettings>): Promise<SocialSettings> {
  const user = await db.user.update({ where: { id: userId }, data: changes });
  // Opening the account lets in everyone who was waiting. Locking it leaves current followers in place.
  if (changes.locked === false) await db.follow.updateMany({ where: { followeeId: userId, status: 'PENDING' }, data: { status: 'ACCEPTED' } });
  return settingsOf(user);
}

/** Friend requests, plus follow requests to a locked account, waiting on this person. */
export async function pendingRequests(db: Db, userId: string): Promise<number> {
  const [friends, followers] = await Promise.all([
    db.friendship.count({ where: { addresseeId: userId, status: 'PENDING' } }),
    db.follow.count({ where: { followeeId: userId, status: 'PENDING' } }),
  ]);
  return friends + followers;
}

/** Everyone else on the tracker, with how you stand with them. */
/** A search returns at most this many people; typing more narrows it. */
export const PEOPLE_SEARCH_LIMIT = 20;

/**
 * Without a query: the people you have any tie with (friends, follows and
 * requests either way). With one: anyone whose username or display name
 * contains it, so a tracker with many people never lists them all.
 */
export async function loadPeople(db: Db, viewerId: string, query?: string): Promise<Person[]> {
  const relations = await relationsOf(db, viewerId);
  const q = query?.trim().replace(/^@/, '');
  const where: Prisma.UserWhereInput = q
    ? {
        id: { not: viewerId },
        OR: [{ username: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }],
      }
    : { id: { in: [...relations.keys()].filter((id) => id !== viewerId) } };
  const users = await db.user.findMany({
    where,
    select: { id: true, username: true, displayName: true, locked: true },
    orderBy: { username: 'asc' },
    ...(q ? { take: PEOPLE_SEARCH_LIMIT } : {}),
  });
  return users.map((u) => ({
    username: u.username,
    displayName: u.displayName,
    locked: u.locked,
    relation: relations.get(u.id) ?? { ...STRANGER },
  }));
}

// ── friends and followers ────────────────────────────────────────────

/** Sends a friend request, or accepts theirs if they asked first. Asking twice changes nothing. */
export async function requestFriend(db: Db, meId: string, otherId: string): Promise<void> {
  const theirs = await db.friendship.findUnique({ where: { requesterId_addresseeId: { requesterId: otherId, addresseeId: meId } } });
  if (theirs) {
    if (theirs.status === 'PENDING') await db.friendship.update({ where: { id: theirs.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    return;
  }
  await db.friendship.upsert({
    where: { requesterId_addresseeId: { requesterId: meId, addresseeId: otherId } },
    create: { requesterId: meId, addresseeId: otherId },
    update: {},
  });
}

/** Unfriends, cancels a request you sent, or declines one you received. */
export async function removeFriend(db: Db, meId: string, otherId: string): Promise<void> {
  await db.friendship.deleteMany({
    where: { OR: [{ requesterId: meId, addresseeId: otherId }, { requesterId: otherId, addresseeId: meId }] },
  });
}

/** Follows an open account at once; on a locked one it's a request until approved. Following twice changes nothing. */
export async function follow(db: Db, meId: string, target: Pick<User, 'id' | 'locked'>): Promise<void> {
  await db.follow.upsert({
    where: { followerId_followeeId: { followerId: meId, followeeId: target.id } },
    create: { followerId: meId, followeeId: target.id, status: target.locked ? 'PENDING' : 'ACCEPTED' },
    update: {},
  });
}

/** `followerId` stops following `followeeId`, whoever asked: unfollow, cancel a request, decline one, or remove a follower. */
export async function removeFollow(db: Db, followerId: string, followeeId: string): Promise<void> {
  await db.follow.deleteMany({ where: { followerId, followeeId } });
}

/** Approves a follow request to your locked account. False when there was none waiting. */
export async function approveFollower(db: Db, meId: string, followerId: string): Promise<boolean> {
  const { count } = await db.follow.updateMany({ where: { followerId, followeeId: meId, status: 'PENDING' }, data: { status: 'ACCEPTED' } });
  return count > 0;
}

// ── records ──────────────────────────────────────────────────────────

/** Settled bets per user, reduced to what scoring needs. */
async function loadUnitBets(db: Db, userIds: string[]): Promise<Map<string, UnitBet[]>> {
  const coupons = await db.coupon.findMany({
    where: { sportsbookAccount: { userId: { in: userIds } }, status: { not: 'OPEN' } },
    select: {
      status: true,
      rewardType: true,
      placedAt: true,
      totalStakeMinor: true,
      actualPayoutMinor: true,
      bets: { select: { oddsRaw: true } },
      sportsbookAccount: { select: { userId: true } },
    },
  });
  const byUser = new Map<string, UnitBet[]>();
  for (const c of coupons) {
    const list = byUser.get(c.sportsbookAccount.userId) ?? [];
    list.push({
      status: c.status,
      // A system coupon holds several bets, so it has no single price; it scores on what it returned.
      oddsRaw: c.bets.length === 1 ? c.bets[0]!.oddsRaw : null,
      stakeMinor: c.totalStakeMinor ?? 0,
      payoutMinor: c.actualPayoutMinor ?? 0,
      rewardType: c.rewardType,
      placedAt: c.placedAt,
    });
    byUser.set(c.sportsbookAccount.userId, list);
  }
  return byUser;
}

export async function loadLeaderboard(db: Db, viewerId: string, period: Period, now = new Date()): Promise<LeaderboardView> {
  const [users, relations] = await Promise.all([
    db.user.findMany({
      where: { showOnLeaderboard: true },
      select: { id: true, username: true, displayName: true, shareAmountsLeaderboard: true },
    }),
    relationsOf(db, viewerId),
  ]);
  const betsByUser = await loadUnitBets(db, users.map((u) => u.id));
  const rows = users.map((u) => {
    const bets = (betsByUser.get(u.id) ?? []).filter((b) => inPeriod(b.placedAt, period, now));
    return {
      username: u.username,
      displayName: u.displayName,
      isYou: u.id === viewerId,
      isFriend: relations.get(u.id)?.friend === 'FRIENDS',
      ...unitStats(bets),
      // Also null on your own row unless you share it, so you see what everyone else sees.
      netMinor: u.shareAmountsLeaderboard ? netMinor(bets) : null,
    };
  });
  return { period, minBets: MIN_BETS[period], generatedAt: now.toISOString(), rows: rank(rows, period) };
}

export async function loadProfile(db: Db, viewerId: string, target: User, now = new Date()): Promise<ProfileView> {
  const isYou = target.id === viewerId;
  const relation: Relation = isYou ? { ...STRANGER } : await relationWith(db, viewerId, target.id);
  const access = accessTo(target, viewerId, relation);
  const [friends, followers, following, bets] = await Promise.all([
    db.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: target.id }, { addresseeId: target.id }] } }),
    db.follow.count({ where: { followeeId: target.id, status: 'ACCEPTED' } }),
    db.follow.count({ where: { followerId: target.id, status: 'ACCEPTED' } }),
    access.stats ? loadUnitBets(db, [target.id]).then((m) => m.get(target.id) ?? []) : null,
  ]);
  const statsFor = (period: Period) => unitStats(bets!.filter((b) => inPeriod(b.placedAt, period, now)));
  return {
    username: target.username,
    displayName: target.displayName,
    joinedAt: target.createdAt.toISOString(),
    isYou,
    locked: target.locked,
    relation,
    counts: { friends, followers, following },
    stats: bets ? { week: statsFor('week'), month: statsFor('month'), all: statsFor('all') } : null,
    canSeeBets: access.bets,
    canSeeAmounts: access.amounts,
  };
}
