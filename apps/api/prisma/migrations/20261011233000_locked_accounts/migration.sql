-- An account is open (anyone can follow; the default) or locked (followers
-- need approval, like friends). Everyone following today keeps following.

-- AlterTable
ALTER TABLE "Follow" ADD COLUMN     "status" "RequestStatus" NOT NULL DEFAULT 'ACCEPTED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;
