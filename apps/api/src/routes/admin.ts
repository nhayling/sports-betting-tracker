import { Router, type RequestHandler } from 'express';
import type { Db } from '../db';
import { authOf } from '../auth';
import { approveRequest, declineRequest, isAdminHost } from '../auth/access';
import { createInvite } from '../auth/invites';
import type { AccessRequest, InviteRow, Member, NewInvite } from '../admin/types';
import type { Mailer } from '../email/mailer';

const DAY_MS = 24 * 60 * 60_000;
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const newest = (dates: (Date | null)[]) => dates.reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null);

/**
 * The admin site's API, mounted after requireSessionAuth:
 *   GET  /api/admin/me                             who's signed in (403 for anyone who isn't an admin)
 *   GET  /api/admin/requests                       requests to join, oldest first
 *   POST /api/admin/requests/:username/approve     they can sign in (and are emailed)
 *   POST /api/admin/requests/:username/decline     deletes the request (and emails them)
 *   GET  /api/admin/members                        everyone approved
 *   GET  /api/admin/invites                        recent invite links
 *   POST /api/admin/invites { days }               a new single-use link
 * Only on the admin host, so the app's own sign-in can never reach it.
 */
export function adminRouter(db: Db, mailer: Mailer, publicUrl?: string): Router {
  const router = Router();

  const adminOnly: RequestHandler = async (req, res, next) => {
    if (!isAdminHost(req.get('host'))) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const user = await db.user.findUnique({ where: { id: authOf(res).userId }, select: { admin: true } });
    if (!user?.admin) {
      res.status(403).json({ error: 'This account can’t use the admin site.', notAdmin: true });
      return;
    }
    next();
  };
  router.use(adminOnly);

  router.get('/me', (_req, res) => {
    res.json({ username: authOf(res).username });
  });

  router.get('/requests', async (_req, res) => {
    const users = await db.user.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
    const requests: AccessRequest[] = users.map((u) => ({ username: u.username, email: u.email, note: u.accessNote, askedAt: u.createdAt.toISOString() }));
    res.json({ requests });
  });

  for (const [action, answer] of [
    ['approve', approveRequest],
    ['decline', declineRequest],
  ] as const) {
    router.post(`/requests/:username/${action}`, async (req, res) => {
      const result = await answer(db, mailer, req.params.username.trim().toLowerCase());
      if (!result.ok) {
        res.status(409).json({ error: result.error });
        return;
      }
      console.log(`[access] ${authOf(res).username} ${action === 'approve' ? 'approved' : 'declined'} ${req.params.username}`);
      res.json({ ok: true, emailed: result.emailed });
    });
  }

  router.get('/members', async (_req, res) => {
    const users = await db.user.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: { sportsbookAccounts: { select: { lastCapturedAt: true, lastSyncedAt: true } }, sessions: { select: { lastSeenAt: true } } },
    });
    const members: Member[] = users.map((u) => ({
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      admin: u.admin,
      joinedAt: u.createdAt.toISOString(),
      lastSyncAt: iso(newest(u.sportsbookAccounts.map((a) => a.lastCapturedAt ?? a.lastSyncedAt))),
      lastSeenAt: iso(newest(u.sessions.map((s) => s.lastSeenAt))),
    }));
    res.json({ members });
  });

  router.get('/invites', async (_req, res) => {
    const rows = await db.invite.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    const invites: InviteRow[] = rows.map((i) => ({ id: i.id, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString(), usedAt: iso(i.usedAt), usedByUsername: i.usedByUsername }));
    res.json({ invites });
  });

  router.post('/invites', async (req, res) => {
    const days = req.body?.days ?? 7;
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      res.status(400).json({ error: 'An invite lasts 1 to 90 days' });
      return;
    }
    const { token, expiresAt } = await createInvite(db, days * DAY_MS);
    // The link opens the app, not this site.
    const base = (publicUrl || `${req.protocol}://${req.get('host')!.replace(/^admin\./i, '')}`).replace(/\/+$/, '');
    // The token sits after "#", so it never reaches server logs.
    const invite: NewInvite = { url: `${base}/#invite=${token}`, expiresAt: expiresAt.toISOString() };
    res.status(201).json(invite);
  });

  return router;
}
