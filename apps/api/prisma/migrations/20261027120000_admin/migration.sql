-- Admins open the admin site; nobody is one until npm run access -- admin <username>.
ALTER TABLE "User" ADD COLUMN     "admin" BOOLEAN NOT NULL DEFAULT false;
