BEGIN;
-- CreateEnum
CREATE TYPE "FormKind" AS ENUM ('form', 'survey');

-- CreateEnum
CREATE TYPE "FormModule" AS ENUM ('leads', 'clients', 'employees', 'support', 'projects', 'none');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "FormResponseSource" AS ENUM ('public_link', 'embed', 'personal_link', 'internal');

-- AlterTable
ALTER TABLE "PublicForm" ADD COLUMN     "action" TEXT,
ADD COLUMN     "afterSubmit" JSONB,
ADD COLUMN     "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "embedSettings" JSONB,
ADD COLUMN     "fields" JSONB,
ADD COLUMN     "kind" "FormKind" NOT NULL DEFAULT 'form',
ADD COLUMN     "module" "FormModule" NOT NULL DEFAULT 'none',
ADD COLUMN     "status" "FormStatus" NOT NULL DEFAULT 'published',
ADD COLUMN     "surveySettings" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "entityType" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "answersEnc" TEXT NOT NULL,
    "score" INTEGER,
    "source" "FormResponseSource" NOT NULL DEFAULT 'public_link',
    "linkedEntityType" TEXT,
    "linkedEntityId" TEXT,
    "respondentType" TEXT,
    "respondentId" TEXT,
    "departmentId" TEXT,
    "copiedFields" JSONB,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "responseId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "FormInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormResponse_tenantId_formId_createdAt_idx" ON "FormResponse"("tenantId", "formId", "createdAt");

-- CreateIndex
CREATE INDEX "FormResponse_tenantId_linkedEntityType_linkedEntityId_idx" ON "FormResponse"("tenantId", "linkedEntityType", "linkedEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "FormInvite_tokenHash_key" ON "FormInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "FormInvite_responseId_key" ON "FormInvite"("responseId");

-- CreateIndex
CREATE INDEX "FormInvite_tenantId_formId_recipientId_idx" ON "FormInvite"("tenantId", "formId", "recipientId");

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "PublicForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormInvite" ADD CONSTRAINT "FormInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormInvite" ADD CONSTRAINT "FormInvite_formId_fkey" FOREIGN KEY ("formId") REFERENCES "PublicForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormInvite" ADD CONSTRAINT "FormInvite_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FormResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing forms keep their behavior: their module and action come from the record they created.
UPDATE "PublicForm" SET "module" = 'leads', "action" = 'create_lead' WHERE "entityType" = 'contact';
UPDATE "PublicForm" SET "module" = 'employees', "action" = 'create_employee' WHERE "entityType" = 'employee';
UPDATE "PublicForm" SET "module" = 'clients', "action" = 'create_client' WHERE "entityType" = 'client';
COMMIT;
