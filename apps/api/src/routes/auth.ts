import { Router, type Request, type Response } from 'express';
import type { Db } from '../db';
import { LoginLimiter } from '../auth/loginLimiter';
import { findUsableInvite } from '../auth/invites';
import { announceRequest } from '../auth/access';
import type { Mailer } from '../email/mailer';
import { hashPassword, MIN_PASSWORD_LENGTH, normalizeEmail, USERNAME_PATTERN, verifyPassword } from '../auth/password';
import { bearerToken } from '../auth';
import { createApiKey, deleteApiKey } from '../auth/apiKeys';
import { createSession, deleteSession, findSession, readCookie, SESSION_COOKIE, SESSION_TTL_MS, sessionCookie } from '../auth/sessions';
import { printable } from '../printable';

// Compared against when the username doesn't exist, so timing doesn't reveal valid usernames.
const dummyHash = hashPassword('not-a-real-password');

/** A note left when asking for access is for whoever approves it; this keeps it to a sentence or two. */
export const MAX_ACCESS_NOTE_LENGTH = 280;

const PENDING = 'Your request to join is waiting for approval. You can sign in once it’s approved.';

/**
 * POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me, PATCH /api/auth/email for the web app;
 * POST and DELETE /api/auth/extension-token for the extension;
 * GET /api/auth/invite/:token and POST /api/auth/register for invite links;
 * POST /api/auth/signup to ask for access (the account waits for approval on the admin site, or npm run access).
 */
export function authRouter(db: Db, mailer: Mailer, limiter = new LoginLimiter(), signupLimiter = new LoginLimiter()): Router {
  const router = Router();

  const sessionUser = async (req: Request) => {
    const token = readCookie(req.get('cookie'), SESSION_COOKIE);
    const session = token ? await findSession(db, token) : null;
    return session ? db.user.findUnique({ where: { id: session.user.id } }) : null;
  };

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

    // `username` may be an email: anything with an @ is looked up that way.
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return null;
    }
    const login = username.trim().toLowerCase();
    // Counted as a failure up front, before the slow password check, and cleared if it turns out right.
    limiter.fail(client, login);
    const user = await db.user.findUnique({ where: login.includes('@') ? { email: login } : { username: login } });
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) {
      res.status(401).json({ error: 'Invalid username, email or password' });
      return null;
    }
    limiter.succeed(client, login);
    // Only someone who knows the password learns the request is still waiting.
    if (user.status === 'PENDING') {
      res.status(403).json({ error: PENDING, pending: true });
      return null;
    }
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

  /**
   * The login fields both ways in share: username, password, and an email (required when
   * asking for access, optional with an invite). Sends the error and returns null if they fail.
   */
  const checkNewLogin = async (req: Request, res: Response, emailRequired: boolean) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const { password } = req.body ?? {};
    const rawEmail = req.body?.email;
    const email = normalizeEmail(rawEmail);
    if (!USERNAME_PATTERN.test(username)) {
      res.status(400).json({ error: 'Username must be 2-40 characters: letters, numbers, . _ -' });
      return null;
    }
    if (!email && (emailRequired || (typeof rawEmail === 'string' && rawEmail.trim()))) {
      res.status(400).json({ error: 'Enter a valid email address' });
      return null;
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return null;
    }
    if (await db.user.findUnique({ where: { username } })) {
      res.status(409).json({ error: 'That username is taken' });
      return null;
    }
    if (email && (await db.user.findUnique({ where: { email } }))) {
      res.status(409).json({ error: 'That email already has an account. Sign in instead.' });
      return null;
    }
    return { username, email, password };
  };

  /** Two sign-ups racing for the same username or email: the database's unique keys decide. */
  const taken = (err: unknown) => (err as { code?: string; meta?: { target?: string[] } }).code === 'P2002';
  const takenMessage = (err: unknown) =>
    ((err as { meta?: { target?: string[] } }).meta?.target ?? []).includes('email') ? 'That email already has an account. Sign in instead.' : 'That username is taken';

  // Asking for access: anyone can, and the account waits until it's approved.
  router.post('/signup', async (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json' });
      return;
    }
    // Every request counts, not just failures: 5 per 15 minutes from one address.
    const client = req.ip ?? 'unknown';
    const wait = signupLimiter.retryAfterSeconds(client);
    if (wait !== null) {
      res.set('Retry-After', String(wait)).status(429).json({ error: `Too many requests. Try again in ${Math.ceil(wait / 60)} min.` });
      return;
    }
    signupLimiter.fail(client);
    // On one line and free of escape codes: `npm run access` prints it for whoever approves requests.
    const note = typeof req.body?.note === 'string' ? printable(req.body.note).replace(/\s+/g, ' ').trim() : '';
    if (note.length > MAX_ACCESS_NOTE_LENGTH) {
      res.status(400).json({ error: `Keep the note under ${MAX_ACCESS_NOTE_LENGTH} characters` });
      return;
    }
    const login = await checkNewLogin(req, res, true);
    if (!login) return;
    let user;
    try {
      user = await db.user.create({
        data: { username: login.username, email: login.email, passwordHash: await hashPassword(login.password), status: 'PENDING', accessNote: note || null },
      });
    } catch (err) {
      if (!taken(err)) throw err;
      res.status(409).json({ error: takenMessage(err) });
      return;
    }
    // Shows in npm run deploy:logs; npm run access lists and approves.
    console.log(`[access] ${login.username} <${login.email}> asked to join${note ? `: ${note}` : ''}`);
    await announceRequest(db, mailer, user);
    res.status(201).json({ status: 'PENDING' });
  });

  // Registration with an invite link: single-use, and whoever opens it picks the login. No approval needed.
  router.post('/register', async (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json' });
      return;
    }
    const { token } = req.body ?? {};
    if (typeof token !== 'string' || !token) {
      res.status(400).json({ error: 'An invite link is required to register' });
      return;
    }
    const invite = await findUsableInvite(db, token);
    if (!invite) {
      res.status(404).json({ error: INVITE_GONE });
      return;
    }
    const login = await checkNewLogin(req, res, false);
    if (!login) return;
    const { username, email, password } = login;
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
        return tx.user.create({ data: { username, email, passwordHash } });
      });
    } catch (err) {
      if (!taken(err)) throw err;
      res.status(409).json({ error: takenMessage(err) });
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
    const user = await sessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.json({ username: user.username, email: user.email, emailVerified: !!user.emailVerifiedAt });
  });

  // Adding (or changing) your email. Optional for accounts made before emails were asked for.
  router.patch('/email', async (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json' });
      return;
    }
    const user = await sessionUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: 'Enter a valid email address' });
      return;
    }
    if (email === user.email) {
      res.json({ email, emailVerified: !!user.emailVerifiedAt });
      return;
    }
    try {
      // A new address hasn't been confirmed, whatever the old one was.
      await db.user.update({ where: { id: user.id }, data: { email, emailVerifiedAt: null } });
    } catch (err) {
      if (!taken(err)) throw err;
      res.status(409).json({ error: 'That email is already on another account' });
      return;
    }
    res.json({ email, emailVerified: false });
  });

  return router;
}
