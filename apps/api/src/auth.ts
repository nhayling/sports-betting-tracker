import type { RequestHandler, Response } from 'express';
import type { Db } from './db';
import { findApiKey } from './auth/apiKeys';
import { findSession, readCookie, SESSION_COOKIE } from './auth/sessions';

/**
 * Two ways in, both tied to a user:
 *  - `Authorization: Bearer <token>`: the extension, with the token it got by signing in;
 *  - the `sb_session` cookie from logging in: the web app, e.g. on your phone.
 * Sets res.locals.auth. Every query below is scoped to its userId.
 */
export type AuthContext = { kind: 'apiKey' | 'session'; userId: string; username: string; /** The web sign-in in use, on a session. */ sessionId?: string };

export const authOf = (res: Response) => res.locals.auth as AuthContext;

export const bearerToken = (header: string | undefined) => (header?.startsWith('Bearer ') ? header.slice(7).trim() : '');

export function authenticate(db: Db): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization');
    if (header) {
      const key = await findApiKey(db, bearerToken(header));
      if (!key) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
      res.locals.auth = { kind: 'apiKey', userId: key.user.id, username: key.user.username } satisfies AuthContext;
      return next();
    }
    const token = readCookie(req.get('cookie'), SESSION_COOKIE);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.locals.auth = { kind: 'session', userId: session.user.id, username: session.user.username, sessionId: session.id } satisfies AuthContext;
    next();
  };
}

/**
 * Everything but sync: a signed-in person, not an extension or phone key. Keys only sync, so one
 * that leaks (the phone key sits inside the Island Luck page) can't read bets or make more keys.
 */
export const requireSessionAuth: RequestHandler = (_req, res, next) => {
  if ((res.locals.auth as AuthContext | undefined)?.kind !== 'session') {
    res.status(403).json({ error: 'Sign in to the tracker to do this' });
    return;
  }
  next();
};

/** Routes only the extension may use (e.g. sync), not a browser session. */
export const requireApiKeyAuth: RequestHandler = (_req, res, next) => {
  if ((res.locals.auth as AuthContext | undefined)?.kind !== 'apiKey') {
    res.status(403).json({ error: 'This endpoint requires an extension sign-in' });
    return;
  }
  next();
};
