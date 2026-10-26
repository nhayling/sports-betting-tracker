/**
 * Response shapes of /api/social, shared with the web app (type-only).
 *
 * Privacy rules everything here follows:
 *  - Friends are always asked and accepted.
 *  - Followers need no approval on an open account (the default) and need it
 *    on a locked one.
 *  - Friends and followers see a person's picks, odds and results. Real
 *    dollar amounts only reach an audience that person switched on (friends
 *    and followers each have their own switch); otherwise bets are shown at
 *    the minimum stake.
 *  - The leaderboard ranks on units, which can't be turned back into dollars.
 */

import type { CouponView } from '../views/betsViewTypes';

export type Period = 'week' | 'month' | 'all';
export const PERIODS: readonly Period[] = ['week', 'month', 'all'];

/** Settled bets needed before someone is ranked, so one lucky long shot can't top the board. */
export const MIN_BETS: Record<Period, number> = { week: 3, month: 10, all: 20 };

/**
 * A record in units, where every bet is one unit whatever was staked:
 * a win at +300 is +3.0u, a loss is −1u.
 */
export interface UnitStats {
  /** Settled bets that count. Open and void bets don't. */
  bets: number;
  won: number;
  lost: number;
  /** Cashed out or part-settled, counted at what they returned per unit staked. */
  other: number;
  units: number;
  /** units / bets; null with no bets. */
  roi: number | null;
  /** Longest odds on a winning bet (Kambi ×1000). */
  bestHitOddsRaw: number | null;
}

export interface Relation {
  friend: 'NONE' | 'SENT' | 'RECEIVED' | 'FRIENDS';
  /** You → them. REQUESTED while their locked account hasn't approved you. */
  following: 'NONE' | 'REQUESTED' | 'FOLLOWING';
  /** Them → you. REQUESTED only if your account is locked. */
  followsYou: 'NONE' | 'REQUESTED' | 'FOLLOWING';
}

export interface Person {
  username: string;
  displayName: string | null;
  /** Their account is locked: following them is a request. */
  locked: boolean;
  relation: Relation;
}

export interface SocialSettings {
  displayName: string | null;
  /** Locked: followers need your approval. Open: anyone on the tracker can follow you. */
  locked: boolean;
  shareAmountsFriends: boolean;
  shareAmountsFollowers: boolean;
  shareAmountsLeaderboard: boolean;
  showOnLeaderboard: boolean;
  /** Members of your clubs see your picks, odds and results, at the minimum stake. */
  sharePicksClubs: boolean;
}

export interface SocialMe {
  username: string;
  settings: SocialSettings;
  /** Friend requests, and follow requests if your account is locked, waiting on you. */
  pendingRequests: number;
}

/** A standings row: one person's record in units for a period. */
export interface StandingRow extends UnitStats {
  username: string;
  displayName: string | null;
  isYou: boolean;
  /** null until they have MIN_BETS settled bets in the period. */
  rank: number | null;
}

export interface LeaderboardRow extends UnitStats {
  username: string;
  displayName: string | null;
  isYou: boolean;
  isFriend: boolean;
  /** null until they have MIN_BETS settled bets in the period. */
  rank: number | null;
  /** Net winnings in cents; null unless they share amounts on the leaderboard. */
  netMinor: number | null;
}

export interface LeaderboardView {
  period: Period;
  minBets: number;
  generatedAt: string;
  rows: LeaderboardRow[];
}

export interface ProfileView {
  username: string;
  displayName: string | null;
  joinedAt: string;
  isYou: boolean;
  locked: boolean;
  relation: Relation;
  counts: { friends: number; followers: number; following: number };
  /** null when their record isn't visible to you. */
  stats: Record<Period, UnitStats> | null;
  canSeeBets: boolean;
  /** False = their bets come to you at the minimum stake, not what they staked. */
  canSeeAmounts: boolean;
}

// ── Clubs ────────────────────────────────────────────────────────────

export type ClubRole = 'OWNER' | 'MEMBER';

/** A club as it appears on your hub: its leaders and you, for one period. */
export interface ClubSummary {
  id: string;
  name: string;
  role: ClubRole;
  /** You share real amounts with this club. */
  youShareAmounts: boolean;
  memberCount: number;
  /** The top three, then your row if you're not among them. */
  rows: StandingRow[];
  /** Your row, also in `rows`. */
  you: StandingRow;
}

export interface ClubMemberView {
  username: string;
  displayName: string | null;
  role: ClubRole;
  joinedAt: string;
  isYou: boolean;
  /** Their picks reach the club feed. */
  sharesPicks: boolean;
  /** Their real amounts reach this club's members. */
  sharesAmounts: boolean;
}

export interface ClubView {
  id: string;
  name: string;
  role: ClubRole;
  /** Your real amounts reach this club's members. Off until you switch it on. */
  youShareAmounts: boolean;
  createdAt: string;
  inviteCode: string;
  period: Period;
  minBets: number;
  /** Every member, ranked like the leaderboard. Joining a club puts your units on its board. */
  board: StandingRow[];
  members: ClubMemberView[];
}

/** What an invite link shows before you join. */
export interface ClubInvite {
  id: string;
  name: string;
  memberCount: number;
  isMember: boolean;
}

/** One bet in a club's feed, with whose it is. */
export interface ClubFeedItem {
  username: string;
  displayName: string | null;
  isYou: boolean;
  coupon: CouponView;
  /** Set when this bet is shown at the minimum stake instead of what was staked. */
  minBetMinor?: number;
}
