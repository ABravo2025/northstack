BEGIN;
ALTER TABLE "ExpenseMovement" ADD COLUMN     "companyId" TEXT;
CREATE INDEX "ExpenseMovement_tenantId_companyId_idx" ON "ExpenseMovement"("tenantId", "companyId");
ALTER TABLE "ExpenseMovement" ADD CONSTRAINT "ExpenseMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
