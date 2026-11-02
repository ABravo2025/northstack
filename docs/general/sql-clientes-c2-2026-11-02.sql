BEGIN;
-- CreateEnum
CREATE TYPE "LeadInboxStatus" AS ENUM ('new', 'working', 'qualified', 'converted', 'disqualified');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "companyName" TEXT,
    "title" TEXT,
    "dealName" TEXT,
    "estimatedAmountCents" INTEGER,
    "notes" TEXT,
    "leadSourceId" TEXT,
    "ownerId" TEXT,
    "status" "LeadInboxStatus" NOT NULL DEFAULT 'new',
    "qualification" JSONB,
    "score" INTEGER NOT NULL DEFAULT 0,
    "touchCount" INTEGER NOT NULL DEFAULT 0,
    "nextTouchAt" TIMESTAMP(3),
    "formId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "disqualifyReason" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedCompanyId" TEXT,
    "convertedContactId" TEXT,
    "convertedOpportunityId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadTouch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "byUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTouch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Lead_tenantId_email_idx" ON "Lead"("tenantId", "email");

-- CreateIndex
CREATE INDEX "LeadTouch_tenantId_leadId_idx" ON "LeadTouch"("tenantId", "leadId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "FieldCatalogDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTouch" ADD CONSTRAINT "LeadTouch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTouch" ADD CONSTRAINT "LeadTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
