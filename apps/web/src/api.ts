import type { BetsView } from '../../api/src/views/betsViewTypes';
import type { Analysis } from '../../api/src/analysis/types';
import type { AccessRequest, InviteRow, Member, NewInvite } from '../../api/src/admin/types';
import type { ClubFeedItem, ClubInvite, ClubSummary, ClubView, LeaderboardView, Period, Person, ProfileView, Relation, SocialMe, SocialSettings } from '../../api/src/social/types';

export type * from '../../api/src/views/betsViewTypes';
export type * from '../../api/src/analysis/types';
export type * from '../../api/src/social/types';
export type * from '../../api/src/admin/types';

export interface PollerStatus {
  running: boolean;
  lastReport: { at: string; liveEvents: number } | null;
  provider?: { pausedUntil: number | null };
}

/** The session is missing or expired; the app shows the sign-in screen. */
export class SignedOutError extends Error {}

/** Signed in with the right password, but the request to join is still waiting for approval. */
export class PendingApprovalError extends Error {}

/** Signed in on the admin site with an account that isn't an admin. */
export class NotAdminError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
  const body = await res.json().catch(() => ({}));
  // Carries the server's words, so a wrong password on the sign-in form says so.
  if (res.status === 401) throw new SignedOutError((body as { error?: string }).error ?? 'Not signed in');
  if (res.status === 403 && (body as { pending?: boolean }).pending) throw new PendingApprovalError((body as { error: string }).error);
  if (res.status === 403 && (body as { notAdmin?: boolean }).notAdmin) throw new NotAdminError((body as { error: string }).error);
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `The tracker had a problem (${res.status}). Try again in a moment.`);
  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

/** `login` is a username or an email. */
export const signIn = (login: string, password: string) => post<{ username: string }>('/api/auth/login', { username: login, password });
export const askToJoin = (username: string, email: string, password: string, note: string) =>
  post<{ status: 'PENDING' }>('/api/auth/signup', { username, email, password, note });
export interface Me {
  username: string;
  email: string | null;
  emailVerified: boolean;
}
export const fetchMe = () => get<Me>('/api/auth/me');
export const saveEmail = (email: string) => patch<Pick<Me, 'email' | 'emailVerified'>>('/api/auth/email', { email });
export const signOut = () => post('/api/auth/logout');
export const checkInvite = (token: string) => get<{ ok: true }>(`/api/auth/invite/${encodeURIComponent(token)}`);
export const register = (token: string, username: string, password: string, email: string) =>
  post<{ username: string }>('/api/auth/register', { token, username, password, email });

/** A personal install link for the phone userscript. It contains a sign-in token. */
export const createPhoneSyncLink = () => post<{ url: string }>('/api/phone-sync');

/** An extension or phone that can sync to your account. */
export interface Device {
  id: string;
  kind: 'phone' | 'extension';
  /** The extension's browser User-Agent, or "Phone userscript". Never shown raw. */
  label: string | null;
  createdAt: string;
  /** Refreshed about once an hour. */
  lastUsedAt: string | null;
}
/** A web sign-in. */
export interface WebSession {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}
export const fetchDevices = () => get<{ devices: Device[]; sessions: WebSession[] }>('/api/devices');
export const removeDevice = (id: string) => del<{ removed: true }>(`/api/devices/${encodeURIComponent(id)}`);
export const signOutSession = (id: string) => del<{ signedOut: number }>(`/api/devices/sessions/${encodeURIComponent(id)}`);
export const signOutOthers = () => post<{ signedOut: number }>('/api/devices/sessions/revoke-others');

export const fetchBets = (view: 'open' | 'settled') => get<BetsView>(`/api/bets?view=${view}`);
export const fetchPollerStatus = () => get<PollerStatus>('/api/live/status');

export interface NotificationItem {
  id: string;
  kind: 'PICK_HIT' | 'PICK_MISSED' | 'PROBABLY_SETTLED';
  /** The bet it is about, when it is about one. */
  couponId: string | null;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export const fetchNotifications = () => get<{ unread: number; items: NotificationItem[] }>('/api/notifications?limit=50');
export const markNotificationsRead = () => post<{ marked: number }>('/api/notifications/read');

export const fetchAnalysis = (fundingMaxOdds?: number, period: Period = 'all') =>
  get<Analysis>(`/api/analysis?period=${period}${fundingMaxOdds ? `&fundingMaxOdds=${fundingMaxOdds}` : ''}`);

// ── Social ───────────────────────────────────────────────────────────

const person = (username: string) => encodeURIComponent(username);

export const fetchSocialMe = () => get<SocialMe>('/api/social/me');
export const saveSocialSettings = (changes: Partial<SocialSettings>) => patch<SocialSettings>('/api/social/settings', changes);
export const fetchPeople = (q = '') => get<{ people: Person[] }>(`/api/social/people${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
export const fetchLeaderboard = (period: Period) => get<LeaderboardView>(`/api/social/leaderboard?period=${period}`);
export const fetchProfile = (username: string) => get<ProfileView>(`/api/social/profiles/${person(username)}`);
export const fetchProfileBets = (username: string, view: 'open' | 'settled') =>
  get<BetsView>(`/api/social/profiles/${person(username)}/bets?view=${view}`);

/**
 * friends: you and them (add = ask, or accept theirs). follows: you following
 * them (a request if their account is locked). followers: them following you
 * (add = approve their request to your locked account).
 */
export type Tie = 'friends' | 'follows' | 'followers';
export const addTie = (tie: Tie, username: string) => post<{ relation: Relation }>(`/api/social/${tie}/${person(username)}`);
export const removeTie = (tie: Tie, username: string) => del<{ relation: Relation }>(`/api/social/${tie}/${person(username)}`);

// ── Clubs ────────────────────────────────────────────────────────────

const club = (id: string) => `/api/clubs/${encodeURIComponent(id)}`;

export const fetchClubs = (period: Period) => get<{ clubs: ClubSummary[] }>(`/api/clubs?period=${period}`);
export const createClub = (name: string) => post<{ id: string }>('/api/clubs', { name });
export const fetchClub = (id: string, period: Period) => get<ClubView>(`${club(id)}?period=${period}`);
export const fetchClubFeed = (id: string, view: 'open' | 'settled') => get<{ items: ClubFeedItem[]; hidden: number }>(`${club(id)}/bets?view=${view}`);
export const renameClub = (id: string, name: string) => patch<{ name: string }>(club(id), { name });
export const resetClubInvite = (id: string) => post<{ inviteCode: string }>(`${club(id)}/invite`);
export const setClubSharing = (id: string, shareAmounts: boolean) => patch<{ shareAmounts: boolean }>(`${club(id)}/membership`, { shareAmounts });
export const leaveClub = (id: string) => del<{ left: true }>(`${club(id)}/membership`);
export const removeClubMember = (id: string, username: string) => del<{ removed: true }>(`${club(id)}/members/${person(username)}`);
export const deleteClub = (id: string) => del<{ deleted: true }>(club(id));
export const fetchClubInvite = (code: string) => get<ClubInvite>(`/api/clubs/invites/${encodeURIComponent(code)}`);
export const joinClub = (code: string) => post<{ id: string }>(`/api/clubs/invites/${encodeURIComponent(code)}`);
/** The link members share: it opens the club's join screen in the app. */
export const clubInviteUrl = (code: string) => `${location.origin}/#social/join/${code}`;

// ── The admin site (admin.<domain>) ──
export const fetchAdminMe = () => get<{ username: string }>('/api/admin/me');
export const fetchAccessRequests = () => get<{ requests: AccessRequest[] }>('/api/admin/requests');
export const answerAccessRequest = (username: string, answer: 'approve' | 'decline') => post<{ ok: true; emailed: boolean }>(`/api/admin/requests/${encodeURIComponent(username)}/${answer}`);
export const fetchMembers = () => get<{ members: Member[] }>('/api/admin/members');
export const fetchInvites = () => get<{ invites: InviteRow[] }>('/api/admin/invites');
export const createInviteLink = (days: number) => post<NewInvite>('/api/admin/invites', { days });
