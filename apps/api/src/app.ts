import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import type { Db } from './db';
import { authenticate, requireApiKeyAuth, requireSessionAuth } from './auth';
import type { LoginLimiter } from './auth/loginLimiter';
import { authRouter } from './routes/auth';
import { performanceRouter } from './routes/performance';
import { betsRouter } from './routes/bets';
import { couponsRouter } from './routes/coupons';
import { islandLuckSyncRouter } from './routes/islandLuckSync';
import { liveRouter } from './routes/live';
import { notificationsRouter } from './routes/notifications';
import { islandLuckCors, phoneSyncRouter, userscriptRouter } from './routes/phoneSync';
import { socialRouter } from './routes/social';
import { clubsRouter } from './routes/clubs';
import { devicesRouter } from './routes/devices';
import { adminRouter } from './routes/admin';
import { isAdminHost } from './auth/access';
import { postmarkMailer, type Mailer } from './email/mailer';
import type { PollerStatus } from './live/poller';

// No CORS headers on purpose: web pages can't read responses, and the
// extension reaches the API through its granted host permission. The one
// exception is the sync endpoint for the phone userscript (see islandLuckCors).
export interface AppOptions {
  /** Express "trust proxy" setting, for running behind a reverse proxy that terminates HTTPS. */
  trustProxy?: number | string | boolean;
  pollerStatus?: () => PollerStatus | null;
  /** Built web app (apps/web/dist) to serve at /, so a phone only needs one URL. Its admin.html is the admin site, on the admin host only. */
  webDist?: string;
  loginLimiter?: LoginLimiter;
  /** Throttles asking for access (every request counts). */
  signupLimiter?: LoginLimiter;
  /** Where people open the tracker, e.g. https://bets.example.com. Defaults to the request's own host. */
  publicUrl?: string;
  /** Emails about requests to join. Defaults to Postmark, set up from the environment. */
  mailer?: Mailer;
}

export function createApp(db: Db, opts: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  const mailer = opts.mailer ?? postmarkMailer();
  // Behind a proxy this makes req.secure (Secure cookies) and req.ip (login throttle) reflect the real client.
  if (opts.trustProxy !== undefined) app.set('trust proxy', opts.trustProxy);
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter(db, mailer, opts.loginLimiter, opts.signupLimiter));
  app.use('/userscript', userscriptRouter(db, opts.publicUrl));
  app.use('/api/integrations/island-luck/sync', islandLuckCors);
  app.use('/api', authenticate(db));
  app.use('/api/integrations/island-luck/sync', requireApiKeyAuth, islandLuckSyncRouter(db));
  app.use('/api', requireSessionAuth);
  app.use('/api/coupons', couponsRouter(db));
  app.use('/api/bets', betsRouter(db));
  app.use('/api/performance', performanceRouter(db));
  app.use('/api/notifications', notificationsRouter(db));
  app.use('/api/phone-sync', phoneSyncRouter(db, opts.publicUrl));
  app.use('/api/social', socialRouter(db));
  app.use('/api/clubs', clubsRouter(db));
  // Session-only (mounted after requireSessionAuth): a key must never list or remove keys.
  app.use('/api/devices', devicesRouter(db));
  app.use('/api/live', liveRouter(opts.pollerStatus ?? (() => null)));
  app.use('/api/admin', adminRouter(db, mailer, opts.publicUrl));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (opts.webDist && existsSync(join(opts.webDist, 'index.html'))) {
    // The admin host gets the admin page, and the app's host never does.
    const page = (req: express.Request) => (isAdminHost(req.get('host')) && existsSync(join(opts.webDist!, 'admin.html')) ? 'admin.html' : 'index.html');
    const sendPage: express.RequestHandler = (req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(join(opts.webDist!, page(req)));
    };
    // Hashed assets can be cached forever; the pages must always be fresh.
    app.use('/assets', express.static(join(opts.webDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.get(['/', '/index.html', '/admin.html'], sendPage);
    app.use(express.static(opts.webDist, { index: false, maxAge: 0 }));
    app.get('/{*path}', sendPage);
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
