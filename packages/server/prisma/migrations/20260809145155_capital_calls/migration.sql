-- CreateEnum
CREATE TYPE "CapitalCallStatus" AS ENUM ('draft', 'issued', 'settled', 'cancelled');

-- CreateEnum
CREATE TYPE "CallAllocationStatus" AS ENUM ('outstanding', 'paid', 'defaulted');

-- CreateTable
CREATE TABLE "capital_calls" (
    "id" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "callNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "percentOfCommitment" DECIMAL(9,6) NOT NULL,
    "totalCalled" DECIMAL(18,2) NOT NULL,
    "noticeDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "CapitalCallStatus" NOT NULL DEFAULT 'draft',
    "purpose" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capital_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_call_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "capitalCallId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "amountDue" DECIMAL(18,2) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "CallAllocationStatus" NOT NULL DEFAULT 'outstanding',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capital_call_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capital_calls_sponsorTenantId_idx" ON "capital_calls"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "capital_calls_fundId_idx" ON "capital_calls"("fundId");

-- CreateIndex
CREATE UNIQUE INDEX "capital_calls_fundId_callNumber_key" ON "capital_calls"("fundId", "callNumber");

-- CreateIndex
CREATE INDEX "capital_call_allocations_tenantId_idx" ON "capital_call_allocations"("tenantId");

-- CreateIndex
CREATE INDEX "capital_call_allocations_sponsorTenantId_idx" ON "capital_call_allocations"("sponsorTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "capital_call_allocations_capitalCallId_positionId_key" ON "capital_call_allocations"("capitalCallId", "positionId");

-- AddForeignKey
ALTER TABLE "capital_calls" ADD CONSTRAINT "capital_calls_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_call_allocations" ADD CONSTRAINT "capital_call_allocations_capitalCallId_fkey" FOREIGN KEY ("capitalCallId") REFERENCES "capital_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_call_allocations" ADD CONSTRAINT "capital_call_allocations_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

