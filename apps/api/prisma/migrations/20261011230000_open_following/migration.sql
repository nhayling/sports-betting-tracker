-- Following no longer needs approval; being accepted is what friends are for.
-- Any follow request still waiting simply becomes a follow.

-- AlterTable
ALTER TABLE "Follow" DROP COLUMN "respondedAt",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "approveFollowers";
