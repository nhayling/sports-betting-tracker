import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

/**
 * Throwaway `<db>_test` database derived from DATABASE_URL in the repo .env
 * (or TEST_DATABASE_URL). Tables are emptied on setup, so anything whose name
 * doesn't end in _test is refused.
 */
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const testUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, (_m, name, q) => `/${name}_test${q}`);
export const hasTestDb = !!testUrl && /\/[^/?]+_test(\?|$)/.test(testUrl);

export async function setupTestDb(): Promise<PrismaClient> {
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
  const db = new PrismaClient({ datasourceUrl: testUrl });
  await db.$executeRawUnsafe(
    'TRUNCATE "SportsbookAccount", "Coupon", "Bet", "BetLeg", "BetLegLink", "LegSelection", "BetLegProgress", "ExternalEventMapping", "ExternalParticipantMapping", "ProviderEventState", "User", "Session", "ApiKey", "Invite", "Notification", "Friendship", "Follow", "UntrackedMarket", "Club", "ClubMember" CASCADE',
  );
  return db;
}

/** A user that owns bets in a test. The password hash is unusable, so it can't sign in. */
export const createTestUser = (db: PrismaClient, username: string) => db.user.create({ data: { username, passwordHash: '!' } });
