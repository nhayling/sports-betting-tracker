import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The API integration suites share one throwaway Postgres database.
    fileParallelism: false,
  },
});
