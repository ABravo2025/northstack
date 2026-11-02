BEGIN;
-- CreateEnum
CREATE TYPE "CheckInSentiment" AS ENUM ('good', 'neutral', 'bad');

-- CreateTable
CREATE TABLE "CompanyCheckIn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "byUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentiment" "CheckInSentiment" NOT NULL,
    "note" TEXT,
    "nextCheckInAt" DATE,

    CONSTRAINT "CompanyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyCheckIn_tenantId_companyId_at_idx" ON "CompanyCheckIn"("tenantId", "companyId", "at");

-- AddForeignKey
ALTER TABLE "CompanyCheckIn" ADD CONSTRAINT "CompanyCheckIn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCheckIn" ADD CONSTRAINT "CompanyCheckIn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
