BEGIN;
-- CreateEnum
CREATE TYPE "PipelinePurpose" AS ENUM ('new_business', 'expansion', 'renewal', 'other');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "checklistState" JSONB;

-- AlterTable
ALTER TABLE "Pipeline" ADD COLUMN     "purpose" "PipelinePurpose" NOT NULL DEFAULT 'new_business';

-- AlterTable
ALTER TABLE "PipelineStageDefinition" ADD COLUMN     "enterAutomations" JSONB,
ADD COLUMN     "exitChecklist" JSONB;


-- Existing "account" pipelines manage existing clients: not new business.
UPDATE "Pipeline" SET "purpose" = 'other' WHERE "type" = 'account';
COMMIT;
