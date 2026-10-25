import type { BetsView } from '../../api/src/views/betsViewTypes';
import type { Analysis } from '../../api/src/analysis/types';
import type { LeaderboardView, Period, Person, ProfileView, Relation, SocialMe, SocialSettings } from '../../api/src/social/types';

export type * from '../../api/src/views/betsViewTypes';
export type * from '../../api/src/analysis/types';
export type * from '../../api/src/social/types';

export interface PollerStatus {
  running: boolean;
  lastReport: { at: string; liveEvents: number } | null;
  provider?: { pausedUntil: number | null };
}

/** The session is missing or expired; the app shows the sign-in screen. */
export class SignedOutError extends Error {}

/** Signed in with the right password, but the request to join is still waiting for approval. */
export class PendingApprovalError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
  const body = await res.json().catch(() => ({}));
  // Carries the server's words, so a wrong password on the sign-in form says so.
  if (res.status === 401) throw new SignedOutError((body as { error?: string }).error ?? 'Not signed in');
  if (res.status === 403 && (body as { pending?: boolean }).pending) throw new PendingApprovalError((body as { error: string }).error);
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
