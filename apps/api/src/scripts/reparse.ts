/** Re-normalizes stored bets after a parser change: npm run reparse -w @sports-better/api */
import { prisma } from '../db';
import { reparseOutdated } from '../sync/reparse';

console.log(await reparseOutdated(prisma));
await prisma.$disconnect();
