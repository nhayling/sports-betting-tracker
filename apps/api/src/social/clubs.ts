import { randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { asSeenByOthers, loadBetsView, type BetsView } from '../views/betsView';
import { accessTo, loadUnitBets, relationsOf } from './store';
import { MIN_BETS, type ClubFeedItem, type ClubInvite, type ClubMemberView, type ClubSummary, type ClubView, type Period, type StandingRow } from './types';
import { inPeriod, rank, unitStats } from './units';

/**
 * Clubs: invite-only groups with their own board and a feed of members' bets.
 *
 * Joining puts your record in units on the club's board. Your picks reach the
 * feed (and your profile, for members) unless you switch sharePicksClubs off;
 * amounts never travel through a club, so the feed shows other people's bets
 * at the minimum stake unless you could already see their amounts as a friend
 * or follower.
 */

export const MAX_CLUB_NAME = 40;
/** Keeps a board readable and a feed cheap to build. */
export const MAX_CLUB_MEMBERS = 50;
/** How many clubs one person can be in. */
export const MAX_CLUBS_PER_USER = 20;
/** Bets per member that go into the feed; the merged feed is cut to FEED_LIMIT. */
const FEED_PER_MEMBER = 20;
const FEED_LIMIT = 60;

export const newInviteCode = () => randomBytes(12).toString('base64url');

/** Control characters out, runs of space collapsed. Empty means invalid. */
export const cleanClubName = (name: string) =>
  name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

type Member = { userId: string; role: 'OWNER' | 'MEMBER'; shareAmounts: boolean; joinedAt: Date; user: { id: string; username: string; displayName: string | null; sharePicksClubs: boolean } };

const memberSelect = { userId: true, role: true, shareAmounts: true, joinedAt: true, user: { select: { id: true, username: true, displayName: true, sharePicksClubs: true } } } as const;

/** Every member ranked by units for the period, like the leaderboard. */
async function standings(db: Db, members: Member[], viewerId: string, period: Period, now: Date): Promise<StandingRow[]> {
  const bets = await loadUnitBets(
    db,
    members.map((m) => m.userId),
  );
  const rows = members.map((m) => ({
    username: m.user.username,
    displayName: m.user.displayName,
    isYou: m.userId === viewerId,
    ...unitStats((bets.get(m.userId) ?? []).filter((b) => inPeriod(b.placedAt, period, now))),
  }));
  return rank(rows, period);
}

/** The clubs you're in, each with its top three and your row. */
export async function loadClubs(db: Db, viewerId: string, period: Period, now = new Date()): Promise<ClubSummary[]> {
  const clubs = await db.club.findMany({
    where: { members: { some: { userId: viewerId } } },
    include: { members: { select: memberSelect } },
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(
    clubs.map(async (c) => {
      const board = await standings(db, c.members, viewerId, period, now);
      const you = board.find((r) => r.isYou)!;
      const top = board.slice(0, 3);
      const mine = c.members.find((m) => m.userId === viewerId)!;
      return {
        id: c.id,
        name: c.name,
        role: mine.role,
        youShareAmounts: mine.shareAmounts,
        memberCount: c.members.length,
        rows: top.includes(you) ? top : [...top, you],
        you,
      };
    }),
  );
}

/** A club you belong to; null when it doesn't exist or you're not in it, so the two look alike. */
async function clubWithMembers(db: Db, viewerId: string, clubId: string) {
  const club = await db.club.findUnique({ where: { id: clubId }, include: { members: { select: memberSelect, orderBy: { joinedAt: 'asc' } } } });
  return club && club.members.some((m) => m.userId === viewerId) ? club : null;
}

export async function loadClub(db: Db, viewerId: string, clubId: string, period: Period, now = new Date()): Promise<ClubView | null> {
  const club = await clubWithMembers(db, viewerId, clubId);
  if (!club) return null;
  const members: ClubMemberView[] = club.members.map((m) => ({
    username: m.user.username,
    displayName: m.user.displayName,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    isYou: m.userId === viewerId,
    sharesPicks: m.user.sharePicksClubs,
    sharesAmounts: m.user.sharePicksClubs && m.shareAmounts,
  }));
  const mine = club.members.find((m) => m.userId === viewerId)!;
  return {
    id: club.id,
    name: club.name,
    role: mine.role,
    youShareAmounts: mine.shareAmounts,
    createdAt: club.createdAt.toISOString(),
    inviteCode: club.inviteCode,
    period,
    minBets: MIN_BETS[period],
    board: await standings(db, club.members, viewerId, period, now),
    members,
  };
}

/** Members' open or settled bets, newest first: yours as they are, everyone else's as they've shared them. */
export async function loadClubFeed(db: Db, viewerId: string, clubId: string, view: 'open' | 'settled'): Promise<{ items: ClubFeedItem[]; hidden: number } | null> {
  const club = await clubWithMembers(db, viewerId, clubId);
  if (!club) return null;
  const sharing = club.members.filter((m) => m.userId === viewerId || m.user.sharePicksClubs);
  const [relations, users] = await Promise.all([
    relationsOf(db, viewerId),
    db.user.findMany({ where: { id: { in: sharing.map((m) => m.userId) } } }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const views = await Promise.all(
    sharing.map(async (m): Promise<[Member, BetsView]> => {
      const bets = await loadBetsView(db, { userId: m.userId, view, limit: FEED_PER_MEMBER });
      if (m.userId === viewerId) return [m, bets];
      const rel = relations.get(m.userId) ?? { friend: 'NONE', following: 'NONE', followsYou: 'NONE' };
      // Amounts shared with this club count here; ones shared with another club you're both in do too, as on their profile.
      return [m, asSeenByOthers(bets, accessTo(byId.get(m.userId)!, viewerId, rel, { member: true, amounts: m.shareAmounts }).amounts)];
    }),
  );
  const items = views
    .flatMap(([m, v]) =>
      v.coupons.map((coupon) => ({
        username: m.user.username,
        displayName: m.user.displayName,
        isYou: m.userId === viewerId,
        coupon,
        ...(v.minBetMinor !== undefined ? { minBetMinor: v.minBetMinor } : {}),
      })),
    )
    .sort((a, b) => (b.coupon.placedAt ?? '').localeCompare(a.coupon.placedAt ?? ''))
    .slice(0, FEED_LIMIT);
  return { items, hidden: club.members.length - sharing.length };
}

export type ClubError = 'TOO_MANY_CLUBS' | 'CLUB_FULL' | 'NO_SUCH_CLUB' | 'NOT_OWNER' | 'NO_SUCH_MEMBER';

export async function createClub(db: Db, ownerId: string, name: string): Promise<{ id: string } | ClubError> {
  if ((await db.clubMember.count({ where: { userId: ownerId } })) >= MAX_CLUBS_PER_USER) return 'TOO_MANY_CLUBS';
  const club = await db.club.create({ data: { name, inviteCode: newInviteCode(), members: { create: { userId: ownerId, role: 'OWNER' } } } });
  return { id: club.id };
}

export async function inviteOf(db: Db, viewerId: string, code: string): Promise<ClubInvite | null> {
  const club = await db.club.findUnique({ where: { inviteCode: code }, include: { members: { select: { userId: true } } } });
  if (!club) return null;
  return { id: club.id, name: club.name, memberCount: club.members.length, isMember: club.members.some((m) => m.userId === viewerId) };
}

/** Joins by invite code. Joining twice changes nothing. */
export async function joinClub(db: Db, userId: string, code: string): Promise<{ id: string } | ClubError> {
  const club = await db.club.findUnique({ where: { inviteCode: code }, include: { members: { select: { userId: true } } } });
  if (!club) return 'NO_SUCH_CLUB';
  if (club.members.some((m) => m.userId === userId)) return { id: club.id };
  if (club.members.length >= MAX_CLUB_MEMBERS) return 'CLUB_FULL';
  if ((await db.clubMember.count({ where: { userId } })) >= MAX_CLUBS_PER_USER) return 'TOO_MANY_CLUBS';
  await db.clubMember.create({ data: { clubId: club.id, userId } });
  return { id: club.id };
}

async function roleIn(db: Db, userId: string, clubId: string) {
  return (await db.clubMember.findUnique({ where: { clubId_userId: { clubId, userId } } }))?.role ?? null;
}

export async function renameClub(db: Db, userId: string, clubId: string, name: string): Promise<ClubError | null> {
  const role = await roleIn(db, userId, clubId);
  if (!role) return 'NO_SUCH_CLUB';
  if (role !== 'OWNER') return 'NOT_OWNER';
  await db.club.update({ where: { id: clubId }, data: { name } });
  return null;
}

/** A new invite code; the old link stops working. */
export async function resetInvite(db: Db, userId: string, clubId: string): Promise<string | ClubError> {
  const role = await roleIn(db, userId, clubId);
  if (!role) return 'NO_SUCH_CLUB';
  if (role !== 'OWNER') return 'NOT_OWNER';
  return (await db.club.update({ where: { id: clubId }, data: { inviteCode: newInviteCode() } })).inviteCode;
}

/**
 * Leaves a club. When the owner leaves, the longest-standing member takes
 * over; when the last member leaves, the club is gone.
 */
export async function leaveClub(db: Db, userId: string, clubId: string): Promise<ClubError | null> {
  const role = await roleIn(db, userId, clubId);
  if (!role) return 'NO_SUCH_CLUB';
  await db.$transaction(async (tx) => {
    await tx.clubMember.delete({ where: { clubId_userId: { clubId, userId } } });
    const next = await tx.clubMember.findFirst({ where: { clubId }, orderBy: { joinedAt: 'asc' } });
    if (!next) await tx.club.delete({ where: { id: clubId } });
    else if (role === 'OWNER') await tx.clubMember.update({ where: { clubId_userId: { clubId, userId: next.userId } }, data: { role: 'OWNER' } });
  });
  return null;
}

export async function removeMember(db: Db, ownerId: string, clubId: string, username: string): Promise<ClubError | null> {
  const role = await roleIn(db, ownerId, clubId);
  if (!role) return 'NO_SUCH_CLUB';
  if (role !== 'OWNER') return 'NOT_OWNER';
  const { count } = await db.clubMember.deleteMany({ where: { clubId, role: 'MEMBER', user: { username } } });
  return count ? null : 'NO_SUCH_MEMBER';
}

export async function deleteClub(db: Db, ownerId: string, clubId: string): Promise<ClubError | null> {
  const role = await roleIn(db, ownerId, clubId);
  if (!role) return 'NO_SUCH_CLUB';
  if (role !== 'OWNER') return 'NOT_OWNER';
  await db.club.delete({ where: { id: clubId } });
  return null;
}

/** Your own sharing in one club: whether its members see your real amounts. */
export async function setClubSharing(db: Db, userId: string, clubId: string, shareAmounts: boolean): Promise<ClubError | null> {
  const { count } = await db.clubMember.updateMany({ where: { clubId, userId }, data: { shareAmounts } });
  return count ? null : 'NO_SUCH_CLUB';
}
