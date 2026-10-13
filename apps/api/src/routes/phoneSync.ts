import { readFileSync } from 'node:fs';
import { Router, type Request, type RequestHandler } from 'express';
import { authOf } from '../auth';
import { createApiKey, findApiKey } from '../auth/apiKeys';
import type { Db } from '../db';

/**
 * Phone sync: a userscript that does what the browser extension does, for
 * userscript managers on phones (Userscripts on iOS, Violentmonkey on Android
 * Firefox). Each install link carries its own sign-in token.
 */
const SCRIPT_NAME = 'island-luck-sync.user.js';
const template = readFileSync(new URL(`../userscript/${SCRIPT_NAME}`, import.meta.url), 'utf8');

export function renderUserscript(opts: { trackerUrl: string; token: string }): string {
  const trackerUrl = opts.trackerUrl.replace(/\/+$/, '');
  return template
    .replaceAll('__SCRIPT_URL__', scriptUrl(trackerUrl, opts.token))
    .replaceAll('__TRACKER_URL__', JSON.stringify(trackerUrl))
    .replaceAll('__TOKEN__', JSON.stringify(opts.token));
}

const scriptUrl = (trackerUrl: string, token: string) => `${trackerUrl}/userscript/${token}/${SCRIPT_NAME}`;
const trackerUrlOf = (req: Request, publicUrl: string | undefined) => (publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

/** POST /api/phone-sync — a new personal install link for the signed-in user. */
export function phoneSyncRouter(db: Db, publicUrl?: string): Router {
  const router = Router();
  router.post('/', async (req, res) => {
    const token = await createApiKey(db, authOf(res).userId, 'Phone userscript');
    res.json({ url: scriptUrl(trackerUrlOf(req, publicUrl), token) });
  });
  return router;
}

/**
 * GET /userscript/:token/island-luck-sync.user.js — the script itself. The
 * token in the path is the credential (userscript managers fetch the URL
 * without the session cookie), so the same link also serves updates.
 */
export function userscriptRouter(db: Db, publicUrl?: string): Router {
  const router = Router();
  router.get(`/:token/${SCRIPT_NAME}`, async (req, res) => {
    const { token } = req.params;
    if (!/^sbk_[\w-]{20,}$/.test(token) || !(await findApiKey(db, token))) {
      res.status(404).type('text/plain').send('This install link is no longer valid. Get a new one from your tracker.');
      return;
    }
    res
      .set('Cache-Control', 'no-store')
      .type('text/javascript')
      .send(renderUserscript({ trackerUrl: trackerUrlOf(req, publicUrl), token }));
  });
  return router;
}

const ISLAND_LUCK_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*islandluck\.com$/;

/**
 * The userscript runs inside the Island Luck page, so its sync request is
 * cross-origin. Only that origin is allowed, only on the sync endpoint, and
 * without cookies: the bearer token is the only credential.
 */
export const islandLuckCors: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (origin && ISLAND_LUCK_ORIGIN.test(origin)) {
    res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
    if (req.method === 'OPTIONS') {
      res.set({ 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' });
      res.status(204).end();
      return;
    }
  }
  next();
};
