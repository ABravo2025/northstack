BEGIN;
-- AlterTable
ALTER TABLE "ExpenseMovement" ADD COLUMN     "exchangeRate" TEXT,
ADD COLUMN     "originalAmountEnc" TEXT,
ADD COLUMN     "originalCurrency" TEXT;

-- CreateTable
CREATE TABLE "ExpenseReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "nameEnc" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dataEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseReceipt_movementId_key" ON "ExpenseReceipt"("movementId");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_tenantId_idx" ON "ExpenseReceipt"("tenantId");

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "ExpenseMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
