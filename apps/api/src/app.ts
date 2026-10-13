import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import type { Db } from './db';
import { authenticate, requireApiKeyAuth } from './auth';
import type { LoginLimiter } from './auth/loginLimiter';
import { authRouter } from './routes/auth';
import { analysisRouter } from './routes/analysis';
import { betsRouter } from './routes/bets';
import { couponsRouter } from './routes/coupons';
import { islandLuckSyncRouter } from './routes/islandLuckSync';
import { liveRouter } from './routes/live';
import { notificationsRouter } from './routes/notifications';
import { islandLuckCors, phoneSyncRouter, userscriptRouter } from './routes/phoneSync';
import { socialRouter } from './routes/social';
import type { PollerStatus } from './live/poller';

// No CORS headers on purpose: web pages can't read responses, and the
// extension reaches the API through its granted host permission. The one
// exception is the sync endpoint for the phone userscript (see islandLuckCors).
export interface AppOptions {
  /** Express "trust proxy" setting, for running behind a reverse proxy that terminates HTTPS. */
  trustProxy?: number | string | boolean;
  pollerStatus?: () => PollerStatus | null;
  /** Built web app (apps/web/dist) to serve at /, so a phone only needs one URL. */
  webDist?: string;
  loginLimiter?: LoginLimiter;
  /** Where people open the tracker, e.g. https://bets.example.com. Defaults to the request's own host. */
  publicUrl?: string;
}

export function createApp(db: Db, opts: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a proxy this makes req.secure (Secure cookies) and req.ip (login throttle) reflect the real client.
  if (opts.trustProxy !== undefined) app.set('trust proxy', opts.trustProxy);
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter(db, opts.loginLimiter));
  app.use('/userscript', userscriptRouter(db, opts.publicUrl));
  app.use('/api/integrations/island-luck/sync', islandLuckCors);
  app.use('/api', authenticate(db));
  app.use('/api/integrations/island-luck/sync', requireApiKeyAuth, islandLuckSyncRouter(db));
  app.use('/api/coupons', couponsRouter(db));
  app.use('/api/bets', betsRouter(db));
  app.use('/api/analysis', analysisRouter(db));
  app.use('/api/notifications', notificationsRouter(db));
  app.use('/api/phone-sync', phoneSyncRouter(db, opts.publicUrl));
  app.use('/api/social', socialRouter(db));
  app.use('/api/live', liveRouter(opts.pollerStatus ?? (() => null)));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (opts.webDist && existsSync(join(opts.webDist, 'index.html'))) {
    // Hashed assets can be cached forever; index.html must always be fresh.
    app.use('/assets', express.static(join(opts.webDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(opts.webDist, { index: false, maxAge: 0 }));
    app.get('/{*path}', (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(join(opts.webDist!, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === 'entity.too.large' || err?.type === 'entity.parse.failed') {
      res.status(err.status ?? 400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  };
  app.use(onError);

  return app;
}
