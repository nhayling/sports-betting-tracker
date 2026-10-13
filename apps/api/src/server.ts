import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { prisma } from './db';
import { startPoller } from './live/poller';
import { reparseOutdated } from './sync/reparse';

// Apply parser fixes to bets already stored, before the poller reads them.
const reparsed = await reparseOutdated(prisma);
if (reparsed.checked) console.log(`re-parsed ${reparsed.updated} of ${reparsed.checked} stored bets with the current parser`);

const poller = process.env.LIVE_POLLER === 'off' ? null : startPoller(prisma);

const port = Number(process.env.PORT) || 4100;
// 127.0.0.1 by default; set HOST=0.0.0.0 to open the tracker to your phone on home Wi-Fi, or on a server.
// TRUST_PROXY: number of reverse proxies in front (1 behind Caddy/nginx), so HTTPS and client IPs are seen correctly.
const host = process.env.HOST || '127.0.0.1';
const trustProxy = process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : undefined;
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

createApp(prisma, { trustProxy, publicUrl: process.env.PUBLIC_URL, pollerStatus: () => poller?.status() ?? null, webDist }).listen(port, host, () => {
  console.log(`tracker listening on http://localhost:${port}`);
  if (host === '0.0.0.0') {
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => `http://${i!.address}:${port}`);
    for (const url of lan) console.log(`  on your Wi-Fi: ${url}`);
  }
});
