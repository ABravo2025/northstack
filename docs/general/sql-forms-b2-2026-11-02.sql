BEGIN;
ALTER TABLE "PublicForm" ADD COLUMN     "actionConfig" JSONB;
COMMIT;
