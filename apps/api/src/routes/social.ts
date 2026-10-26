import { Router, type Request, type Response } from 'express';
import { authOf } from '../auth';
import { USERNAME_PATTERN } from '../auth/password';
import type { Db } from '../db';
import {
  accessTo,
  approveFollower,
  follow,
  loadLeaderboard,
  loadPeople,
  loadProfile,
  pendingRequests,
  relationWith,
  removeFollow,
  clubTieWith,
  removeFriend,
  requestFriend,
  settingsOf,
  updateSettings,
} from '../social/store';
import { PERIODS, type Period, type SocialMe, type SocialSettings } from '../social/types';
import { asSeenByOthers, loadBetsView } from '../views/betsView';

const MAX_DISPLAY_NAME = 40;
const SWITCHES = ['locked', 'shareAmountsFriends', 'shareAmountsFollowers', 'shareAmountsLeaderboard', 'showOnLeaderboard', 'sharePicksClubs'] as const;

/**
 * Profiles, friends, followers, the leaderboard and privacy settings.
 *
 *   GET    /api/social/me                        your settings and how many requests are waiting
 *   PATCH  /api/social/settings                  { displayName?, locked?, shareAmountsFriends?, … }
 *   GET    /api/social/people[?q=]               people you have a tie with, or a search, with how you stand with them
 *   POST   /api/social/friends/:username         ask, or accept their request
 *   DELETE /api/social/friends/:username         unfriend, cancel or decline
 *   POST   /api/social/follows/:username         follow (a request if their account is locked)
 *   DELETE /api/social/follows/:username         unfollow, or cancel your request
 *   POST   /api/social/followers/:username       approve their request to follow your locked account
 *   DELETE /api/social/followers/:username       decline it, or remove them as a follower
 *   GET    /api/social/leaderboard?period=week|month|all
 *   GET    /api/social/profiles/:username        (your own username works too)
 *   GET    /api/social/profiles/:username/bets?view=open|settled
 */
export function socialRouter(db: Db): Router {
  const router = Router();

  const findUser = (req: Request) => {
    const username = String(req.params.username ?? '').trim().toLowerCase();
    // Someone still waiting for approval isn't on the tracker yet.
    return USERNAME_PATTERN.test(username) ? db.user.findFirst({ where: { username, status: 'ACTIVE' } }) : null;
  };

  /** The other person in a /:username route. Sends the error and returns null when it isn't someone else. */
  const someoneElse = async (req: Request, res: Response) => {
    const user = await findUser(req);
    if (!user) {
      res.status(404).json({ error: 'No such person' });
      return null;
    }
    if (user.id === authOf(res).userId) {
      res.status(400).json({ error: 'That is you' });
      return null;
    }
    return user;
  };

  router.get('/me', async (_req, res) => {
    const { userId } = authOf(res);
    const [user, pending] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: userId } }), pendingRequests(db, userId)]);
    res.json({ username: user.username, settings: settingsOf(user), pendingRequests: pending } satisfies SocialMe);
  });

  router.patch('/settings', async (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const changes: Partial<SocialSettings> = {};
    if ('displayName' in body) {
      if (body.displayName !== null && typeof body.displayName !== 'string') {
        res.status(400).json({ error: 'displayName must be text' });
        return;
      }
      const name = (body.displayName ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
      if (name.length > MAX_DISPLAY_NAME) {
        res.status(400).json({ error: `Display name can be at most ${MAX_DISPLAY_NAME} characters` });
        return;
      }
      changes.displayName = name || null;
    }
    for (const key of SWITCHES) {
      if (!(key in body)) continue;
      if (typeof body[key] !== 'boolean') {
        res.status(400).json({ error: `${key} must be true or false` });
        return;
      }
      changes[key] = body[key];
    }
    res.json(await updateSettings(db, authOf(res).userId, changes));
  });

  router.get('/people', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 50) : undefined;
    res.json({ people: await loadPeople(db, authOf(res).userId, q) });
  });

  router.post('/friends/:username', async (req, res) => {
    const other = await someoneElse(req, res);
    if (!other) return;
    const me = authOf(res).userId;
    await requestFriend(db, me, other.id);
    res.json({ relation: await relationWith(db, me, other.id) });
  });

  router.delete('/friends/:username', async (req, res) => {
    const other = await someoneElse(req, res);
    if (!other) return;
    const me = authOf(res).userId;
    await removeFriend(db, me, other.id);
    res.json({ relation: await relationWith(db, me, other.id) });
  });

  router.post('/follows/:username', async (req, res) => {
    const other = await someoneElse(req, res);
    if (!other) return;
    const me = authOf(res).userId;
    await follow(db, me, other);
    res.json({ relation: await relationWith(db, me, other.id) });
  });

  router.delete('/follows/:username', async (req, res) => {
    const other = await someoneElse(req, res);
    if (!other) return;
    const me = authOf(res).userId;
    await removeFollow(db, me, other.id);
    res.json({ relation: await relationWith(db, me, other.id) });
  });

  router.post('/followers/:username', async (req, res) => {
    const other = await someoneElse(req, res);
    if (!other) return;
    const me = authOf(res).userId;
    if (!(await approveFollower(db, me, other.id))) {
      res.status(404).json({ error: 'No follow request from that person' });
      return;
    }
    res.json({ relation: await relationWith(db, me, other.id) });
  });

  router.delete('/followers/:username', async (req, res) => {
    const other = await someoneElse(req, res);
    if (!other) return;
    const me = authOf(res).userId;
    await removeFollow(db, other.id, me);
    res.json({ relation: await relationWith(db, me, other.id) });
  });

  router.get('/leaderboard', async (req, res) => {
    const period = PERIODS.includes(req.query.period as Period) ? (req.query.period as Period) : 'week';
    res.json(await loadLeaderboard(db, authOf(res).userId, period));
  });

  router.get('/profiles/:username', async (req, res) => {
    const user = await findUser(req);
    if (!user) {
      res.status(404).json({ error: 'No such person' });
      return;
    }
    res.json(await loadProfile(db, authOf(res).userId, user));
  });

  router.get('/profiles/:username/bets', async (req, res) => {
    const user = await findUser(req);
    if (!user) {
      res.status(404).json({ error: 'No such person' });
      return;
    }
    const me = authOf(res).userId;
    const view = req.query.view === 'settled' ? 'settled' : 'open';
    const bets = await loadBetsView(db, { userId: user.id, view, limit: 50 });
    if (user.id === me) {
      res.json(bets);
      return;
    }
    const access = accessTo(user, me, await relationWith(db, me, user.id), await clubTieWith(db, me, user.id));
    if (!access.bets) {
      res.status(403).json({ error: user.locked ? 'This account is locked: only friends and approved followers can see its bets' : 'Follow them or become friends to see their bets' });
      return;
    }
    res.json(asSeenByOthers(bets, access.amounts));
  });

  return router;
}
