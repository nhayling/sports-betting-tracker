-- Bets become private to a tracker user, and the extension signs in with a
-- per-user ApiKey instead of the shared TRACKER_API_KEY.

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiKey_tokenHash_key" ON "ApiKey"("tokenHash");
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing bets were all one person's: give them to the oldest user. If bets
-- exist but no user does, create "owner" with an unusable password; set one
-- with: npm run user -w @sports-better/api -- owner
INSERT INTO "User" ("id", "username", "passwordHash", "updatedAt")
SELECT gen_random_uuid()::text, 'owner', '!', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "SportsbookAccount") AND NOT EXISTS (SELECT 1 FROM "User");

-- AlterTable
ALTER TABLE "SportsbookAccount" ADD COLUMN "userId" TEXT;
UPDATE "SportsbookAccount" SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
ALTER TABLE "SportsbookAccount" ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX "SportsbookAccount_provider_label_key";
CREATE UNIQUE INDEX "SportsbookAccount_userId_provider_label_key" ON "SportsbookAccount"("userId", "provider", "label");
ALTER TABLE "SportsbookAccount" ADD CONSTRAINT "SportsbookAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting a user removes their accounts and, with them, their coupons.
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_sportsbookAccountId_fkey";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_sportsbookAccountId_fkey" FOREIGN KEY ("sportsbookAccountId") REFERENCES "SportsbookAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "userId" TEXT;
UPDATE "Notification" n SET "userId" = a."userId"
FROM "Coupon" c JOIN "SportsbookAccount" a ON a."id" = c."sportsbookAccountId"
WHERE c."id" = n."couponId";
-- Notifications whose bet is gone can't be attributed to anyone.
DELETE FROM "Notification" WHERE "userId" IS NULL;
ALTER TABLE "Notification" ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX "Notification_createdAt_idx";
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
