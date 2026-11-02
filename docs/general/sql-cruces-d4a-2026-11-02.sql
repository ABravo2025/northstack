BEGIN;
ALTER TABLE "ExpenseCategory" ADD COLUMN     "budgetEnc" TEXT;
COMMIT;
