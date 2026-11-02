BEGIN;
-- CreateEnum
CREATE TYPE "ClientTicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "ClientTicketStatus" AS ENUM ('open', 'in_progress', 'waiting', 'resolved', 'closed');

-- CreateTable
CREATE TABLE "ClientTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "priority" "ClientTicketPriority" NOT NULL DEFAULT 'normal',
    "status" "ClientTicketStatus" NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "formResponseId" TEXT,
    "firstResponseDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "firstRespondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTicketComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientTicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientTicket_tenantId_status_idx" ON "ClientTicket"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ClientTicket_tenantId_companyId_idx" ON "ClientTicket"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTicket_tenantId_number_key" ON "ClientTicket"("tenantId", "number");

-- CreateIndex
CREATE INDEX "ClientTicketComment_tenantId_ticketId_idx" ON "ClientTicketComment"("tenantId", "ticketId");

-- AddForeignKey
ALTER TABLE "ClientTicket" ADD CONSTRAINT "ClientTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTicket" ADD CONSTRAINT "ClientTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTicketComment" ADD CONSTRAINT "ClientTicketComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTicketComment" ADD CONSTRAINT "ClientTicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ClientTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
