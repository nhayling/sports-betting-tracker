import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The API integration suites share one throwaway Postgres database.
    fileParallelism: false,
    // Set (empty) before the suites load the repo .env, which never overrides it: tests never send real email.
    env: { POSTMARK_API_TOKEN: '' },
    // Tool folders (Claude Code, Impeccable and friends) can bring their own tests.
    exclude: [...configDefaults.exclude, '.agents/**', '.claude/**', '.codex/**', '.cursor/**', '.impeccable/**'],
  },
});
