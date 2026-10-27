import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// admin.localhost:5173 is the admin site, as admin.<domain> is in production: it gets admin.html, and
// the /api proxy keeps the host so the API answers it.
const adminHost = (): Plugin => ({
  name: 'admin-host',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^admin\./i.test(req.headers.host ?? '') && (req.url === '/' || req.url?.startsWith('/#') || req.url === '/index.html')) req.url = '/admin.html';
      next();
    });
  },
});

// The dev server proxies /api to the tracker, so the sign-in cookie works on the same origin.
// Two pages: the app (index.html) and the admin site (admin.html).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  const apiPort = env.PORT || '4100';
  return {
    plugins: [react(), adminHost()],
    build: {
      rollupOptions: { input: { app: fileURLToPath(new URL('index.html', import.meta.url)), admin: fileURLToPath(new URL('admin.html', import.meta.url)) } },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': { target: `http://localhost:${apiPort}` },
      },
    },
  };
});
