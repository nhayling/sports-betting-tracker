import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The API integration suites share one throwaway Postgres database.
    fileParallelism: false,
    // Tool folders (Claude Code, Impeccable and friends) can bring their own tests.
    exclude: [...configDefaults.exclude, '.agents/**', '.claude/**', '.codex/**', '.cursor/**', '.impeccable/**'],
  },
});
