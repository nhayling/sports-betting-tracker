import { Router, type Request, type Response } from 'express';
import { authOf } from '../auth';
import type { Db } from '../db';
import {
  cleanClubName,
  createClub,
  deleteClub,
  inviteOf,
  joinClub,
  leaveClub,
  loadClub,
  loadClubFeed,
  loadClubs,
  MAX_CLUB_MEMBERS,
  MAX_CLUB_NAME,
  MAX_CLUBS_PER_USER,
  removeMember,
  renameClub,
  resetInvite,
  setClubSharing,
  type ClubError,
} from '../social/clubs';
import { PERIODS, type Period } from '../social/types';

const ERRORS: Record<ClubError, [number, string]> = {
  TOO_MANY_CLUBS: [409, `You can be in at most ${MAX_CLUBS_PER_USER} clubs. Leave one first.`],
  CLUB_FULL: [409, `This club is full: it already has ${MAX_CLUB_MEMBERS} members.`],
  // A club you aren't in looks the same as one that doesn't exist.
  NO_SUCH_CLUB: [404, 'No such club, or you aren’t in it'],
  NOT_OWNER: [403, 'Only the club’s owner can do that'],
  NO_SUCH_MEMBER: [404, 'They aren’t a member of this club'],
};

const fail = (res: Response, err: ClubError) => {
  const [status, error] = ERRORS[err];
  res.status(status).json({ error });
};

const periodOf = (req: Request): Period => (PERIODS.includes(req.query.period as Period) ? (req.query.period as Period) : 'week');
/** Invite codes are base64url; anything else can't match one. */
const codeOf = (req: Request) => (/^[\w-]{8,64}$/.test(String(req.params.code)) ? String(req.params.code) : null);
const clubIdOf = (req: Request) => String(req.params.id);

/** A JSON body's club name, or null after sending the error. */
function nameFrom(req: Request, res: Response): string | null {
  const raw = (req.body as { name?: unknown } | undefined)?.name;
  const name = typeof raw === 'string' ? cleanClubName(raw) : '';
  if (!name) {
    res.status(400).json({ error: 'Give the club a name' });
    return null;
  }
  if (name.length > MAX_CLUB_NAME) {
    res.status(400).json({ error: `A club name can be at most ${MAX_CLUB_NAME} characters` });
    return null;
  }
  return name;
}

/**
 * Clubs: invite-only groups with a board and a feed.
 *
 *   GET    /api/clubs?period=                   your clubs, each with its top three and you
 *   POST   /api/clubs                           { name } start one; you're its owner
 *   GET    /api/clubs/invites/:code             what an invite link opens, before joining
 *   POST   /api/clubs/invites/:code             join
 *   GET    /api/clubs/:id?period=               board and members
 *   GET    /api/clubs/:id/bets?view=open|settled  the feed
 *   PATCH  /api/clubs/:id                       { name } (owner)
 *   POST   /api/clubs/:id/invite                a new invite link; the old one stops working (owner)
 *   PATCH  /api/clubs/:id/membership            { shareAmounts } your real amounts, for this club only
 *   DELETE /api/clubs/:id/membership            leave
 *   DELETE /api/clubs/:id/members/:username     remove a member (owner)
 *   DELETE /api/clubs/:id                       delete the club (owner)
 */
export function clubsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ clubs: await loadClubs(db, authOf(res).userId, periodOf(req)) });
  });

  router.post('/', async (req, res) => {
    const name = nameFrom(req, res);
    if (name === null) return;
    const r = await createClub(db, authOf(res).userId, name);
    if (typeof r === 'string') return fail(res, r);
    res.status(201).json(r);
  });

  router.get('/invites/:code', async (req, res) => {
    const code = codeOf(req);
    const invite = code && (await inviteOf(db, authOf(res).userId, code));
    if (!invite) {
      res.status(404).json({ error: 'This invite link doesn’t work any more. Ask a member for a new one.' });
      return;
    }
    res.json(invite);
  });

  router.post('/invites/:code', async (req, res) => {
    const code = codeOf(req);
    const r = code ? await joinClub(db, authOf(res).userId, code) : 'NO_SUCH_CLUB';
    if (r === 'NO_SUCH_CLUB') {
      res.status(404).json({ error: 'This invite link doesn’t work any more. Ask a member for a new one.' });
      return;
    }
    if (typeof r === 'string') return fail(res, r);
    res.json(r);
  });

  router.get('/:id', async (req, res) => {
    const club = await loadClub(db, authOf(res).userId, clubIdOf(req), periodOf(req));
    if (!club) return fail(res, 'NO_SUCH_CLUB');
    res.json(club);
  });

  router.get('/:id/bets', async (req, res) => {
    const feed = await loadClubFeed(db, authOf(res).userId, clubIdOf(req), req.query.view === 'settled' ? 'settled' : 'open');
    if (!feed) return fail(res, 'NO_SUCH_CLUB');
    res.json(feed);
  });

  router.patch('/:id', async (req, res) => {
    const name = nameFrom(req, res);
    if (name === null) return;
    const err = await renameClub(db, authOf(res).userId, clubIdOf(req), name);
    if (err) return fail(res, err);
    res.json({ name });
  });

  router.post('/:id/invite', async (req, res) => {
    const r = await resetInvite(db, authOf(res).userId, clubIdOf(req));
    if (r === 'NO_SUCH_CLUB' || r === 'NOT_OWNER') return fail(res, r);
    res.json({ inviteCode: r });
  });

  router.patch('/:id/membership', async (req, res) => {
    const share = (req.body as { shareAmounts?: unknown } | undefined)?.shareAmounts;
    if (typeof share !== 'boolean') {
      res.status(400).json({ error: 'shareAmounts must be true or false' });
      return;
    }
    const err = await setClubSharing(db, authOf(res).userId, clubIdOf(req), share);
    if (err) return fail(res, err);
    res.json({ shareAmounts: share });
  });

  router.delete('/:id/membership', async (req, res) => {
    const err = await leaveClub(db, authOf(res).userId, clubIdOf(req));
    if (err) return fail(res, err);
    res.json({ left: true });
  });

  router.delete('/:id/members/:username', async (req, res) => {
    const err = await removeMember(db, authOf(res).userId, clubIdOf(req), String(req.params.username).toLowerCase());
    if (err) return fail(res, err);
    res.json({ removed: true });
  });

  router.delete('/:id', async (req, res) => {
    const err = await deleteClub(db, authOf(res).userId, clubIdOf(req));
    if (err) return fail(res, err);
    res.json({ deleted: true });
  });

  return router;
}
