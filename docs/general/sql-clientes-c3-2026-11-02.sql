BEGIN;
ALTER TABLE "Opportunity" ADD COLUMN     "handoffAt" TIMESTAMP(3),
ADD COLUMN     "handoffProjectId" TEXT;
COMMIT;
