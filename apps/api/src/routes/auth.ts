import { Router, type Request, type Response } from 'express';
import type { Db } from '../db';
import { LoginLimiter } from '../auth/loginLimiter';
import { findUsableInvite } from '../auth/invites';
import { hashPassword, MIN_PASSWORD_LENGTH, USERNAME_PATTERN, verifyPassword } from '../auth/password';
import { bearerToken } from '../auth';
import { createApiKey, deleteApiKey } from '../auth/apiKeys';
import { createSession, deleteSession, findSession, readCookie, SESSION_COOKIE, SESSION_TTL_MS, sessionCookie } from '../auth/sessions';

// Compared against when the username doesn't exist, so timing doesn't reveal valid usernames.
const dummyHash = hashPassword('not-a-real-password');

/**
 * POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me for the web app;
 * POST and DELETE /api/auth/extension-token for the extension;
 * GET /api/auth/invite/:token and POST /api/auth/register for invite links.
 */
export function authRouter(db: Db, limiter = new LoginLimiter()): Router {
  const router = Router();

  /** Checks the posted username and password. Sends the error response and returns null if they fail. */
  const checkCredentials = async (req: Request, res: Response) => {
    // JSON only: plain HTML forms from other sites can't send it without a CORS preflight.
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json' });
      return null;
    }
    const client = req.ip ?? 'unknown';
    const wait = limiter.retryAfterSeconds(client);
    if (wait !== null) {
      res.set('Retry-After', String(wait)).status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` });
      return null;
    }

    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return null;
    }
    const user = await db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) {
      limiter.fail(client);
      res.status(401).json({ error: 'Invalid username or password' });
      return null;
    }
    limiter.succeed(client);
    return user;
  };

  router.post('/login', async (req, res) => {
    const user = await checkCredentials(req, res);
    if (!user) return;
    const { token } = await createSession(db, user.id, req.get('user-agent'));
    res.set('Set-Cookie', sessionCookie(token, { maxAgeMs: SESSION_TTL_MS, secure: req.secure }));
    res.json({ username: user.username });
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req.get('cookie'), SESSION_COOKIE);
    if (token) await deleteSession(db, token);
    res.set('Set-Cookie', sessionCookie('', { maxAgeMs: 0, secure: req.secure }));
    res.json({ ok: true });
  });

  const INVITE_GONE = 'This invite link has expired or was already used. Ask for a new one.';

  router.get('/invite/:token', async (req, res) => {
    if (!(await findUsableInvite(db, req.params.token))) {
      res.status(404).json({ error: INVITE_GONE });
      return;
    }
    res.json({ ok: true });
  });

  // Registration is by invite only: the link is single-use, and whoever opens it picks the login.
  router.post('/register', async (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json' });
      return;
    }
    const { token, password } = req.body ?? {};
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    if (typeof token !== 'string' || !token) {
      res.status(400).json({ error: 'An invite link is required to register' });
      return;
    }
    if (!USERNAME_PATTERN.test(username)) {
      res.status(400).json({ error: 'Username must be 2-40 characters: letters, numbers, . _ -' });
      return;
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }
    const invite = await findUsableInvite(db, token);
    if (!invite) {
      res.status(404).json({ error: INVITE_GONE });
      return;
    }
    if (await db.user.findUnique({ where: { username } })) {
      res.status(409).json({ error: 'That username is taken' });
      return;
    }
    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await db.$transaction(async (tx) => {
        // Claim the invite first, so two requests with the same link can't both succeed.
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date(), usedByUsername: username },
        });
        if (claimed.count !== 1) return null;
        return tx.user.create({ data: { username, passwordHash } });
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      res.status(409).json({ error: 'That username is taken' });
      return;
    }
    if (!user) {
      res.status(404).json({ error: INVITE_GONE });
      return;
    }
    const session = await createSession(db, user.id, req.get('user-agent'));
    res.set('Set-Cookie', sessionCookie(session.token, { maxAgeMs: SESSION_TTL_MS, secure: req.secure }));
    res.status(201).json({ username: user.username });
  });

  // The extension trades the password for a token once, so it never stores the password.
  router.post('/extension-token', async (req, res) => {
    const user = await checkCredentials(req, res);
    if (!user) return;
    const token = await createApiKey(db, user.id, req.get('user-agent'));
    res.json({ username: user.username, token });
  });

  router.delete('/extension-token', async (req, res) => {
    const token = bearerToken(req.get('authorization'));
    if (token) await deleteApiKey(db, token);
    res.json({ ok: true });
  });

  router.get('/me', async (req, res) => {
    const token = readCookie(req.get('cookie'), SESSION_COOKIE);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.json({ username: session.user.username });
  });

  return router;
}
