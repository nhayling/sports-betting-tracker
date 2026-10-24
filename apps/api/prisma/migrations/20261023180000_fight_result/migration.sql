-- How a UFC bout ended (winner, method, round). Fights have no score.

-- AlterTable
ALTER TABLE "ProviderEventState" ADD COLUMN     "result" JSONB;
