-- Emails, optional for everyone who already has an account, and accounts that
-- wait for approval after asking for access. Existing accounts stay ACTIVE.

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PENDING');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessNote" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
