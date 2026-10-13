/**
 * Imports a saved coupon/history.json capture through the same sync path the
 * extension uses.
 *
 *   npm run import -w @sports-better/api -- <file.json> --user <username> [--account "Island Luck"] [--captured-at <ISO>]
 *
 * capturedAt defaults to the file's modification time.
 */
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { couponsOf, type RawHistoryResponse } from '@sports-better/kambi';
import { prisma } from '../db';
import { syncCoupons } from '../sync/syncCoupons';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { user: { type: 'string' }, account: { type: 'string', default: 'Island Luck' }, 'captured-at': { type: 'string' } },
});
const file = positionals[0];
if (!file || !values.user) {
  console.error('usage: import <file.json> --user <username> [--account <label>] [--captured-at <ISO>]');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { username: values.user.trim().toLowerCase() } });
if (!user) {
  console.error(`No user named ${values.user}. Create one with: npm run user -w @sports-better/api -- ${values.user}`);
  process.exit(1);
}

const body = JSON.parse(readFileSync(file, 'utf8')) as RawHistoryResponse;
const capturedAt = values['captured-at'] ? new Date(values['captured-at']) : statSync(file).mtime;

const result = await syncCoupons(prisma, { userId: user.id, accountLabel: values.account!, capturedAt, coupons: couponsOf(body) });
console.log(JSON.stringify(result, null, 2));
await prisma.$disconnect();
process.exit(result.failed > 0 ? 1 : 0);
