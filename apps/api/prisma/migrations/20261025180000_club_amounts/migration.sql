-- Real amounts can reach a club's members, but only club by club and only once
-- the member switches it on.

-- AlterTable
ALTER TABLE "ClubMember" ADD COLUMN     "shareAmounts" BOOLEAN NOT NULL DEFAULT false;
