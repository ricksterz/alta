-- CreateEnum
CREATE TYPE "FundCloseStatus" AS ENUM ('open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "SignatureBlockType" AS ENUM ('signature', 'initials', 'date');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('active', 'partially_transferred', 'transferred', 'redeemed');

-- CreateEnum
CREATE TYPE "TokenizationStatus" AS ENUM ('none', 'pending', 'minted', 'frozen');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('pending_eligibility', 'pending_gp_consent', 'approved', 'rejected', 'settled');

-- AlterEnum
ALTER TYPE "AdvisorRole" ADD VALUE 'fund_admin_ops';

-- AlterEnum
ALTER TYPE "TenantType" ADD VALUE 'fund_admin';

-- AlterTable
ALTER TABLE "funds" ADD COLUMN     "fundAdminTenantId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "fundAdminTenantId" TEXT,
ADD COLUMN     "fundCloseId" TEXT;

-- CreateTable
CREATE TABLE "fund_closes" (
    "id" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "closeDate" TIMESTAMP(3) NOT NULL,
    "status" "FundCloseStatus" NOT NULL DEFAULT 'open',
    "targetAmount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_blocks" (
    "id" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "anvilFieldKey" TEXT NOT NULL,
    "label" TEXT,
    "blockType" "SignatureBlockType" NOT NULL DEFAULT 'signature',
    "signerRole" "SignerRole" NOT NULL,
    "pageNum" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_block_fulfillments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "signatureBlockId" TEXT NOT NULL,
    "appliedValue" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_block_fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "commitmentAmount" DECIMAL(18,2) NOT NULL,
    "fundedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "units" DECIMAL(28,8),
    "status" "PositionStatus" NOT NULL DEFAULT 'active',
    "tokenization" "TokenizationStatus" NOT NULL DEFAULT 'none',
    "chain" TEXT,
    "tokenStandard" TEXT,
    "contractAddress" TEXT,
    "tokenId" TEXT,
    "holderWalletAddress" TEXT,
    "mintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "requestedByTenantId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "toInvestorId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "units" DECIMAL(28,8),
    "status" "TransferStatus" NOT NULL DEFAULT 'pending_eligibility',
    "eligibilitySnapshot" JSONB,
    "rejectionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fund_closes_sponsorTenantId_idx" ON "fund_closes"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "fund_closes_fundId_idx" ON "fund_closes"("fundId");

-- CreateIndex
CREATE INDEX "signature_blocks_sponsorTenantId_idx" ON "signature_blocks"("sponsorTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_blocks_templateId_anvilFieldKey_key" ON "signature_blocks"("templateId", "anvilFieldKey");

-- CreateIndex
CREATE INDEX "signature_block_fulfillments_tenantId_idx" ON "signature_block_fulfillments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "signature_block_fulfillments_signatureRequestId_signatureBl_key" ON "signature_block_fulfillments"("signatureRequestId", "signatureBlockId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_subscriptionId_key" ON "positions"("subscriptionId");

-- CreateIndex
CREATE INDEX "positions_tenantId_idx" ON "positions"("tenantId");

-- CreateIndex
CREATE INDEX "positions_sponsorTenantId_idx" ON "positions"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "positions_fundId_idx" ON "positions"("fundId");

-- CreateIndex
CREATE INDEX "positions_investorId_idx" ON "positions"("investorId");

-- CreateIndex
CREATE INDEX "transfer_requests_tenantId_idx" ON "transfer_requests"("tenantId");

-- CreateIndex
CREATE INDEX "transfer_requests_sponsorTenantId_idx" ON "transfer_requests"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "transfer_requests_positionId_idx" ON "transfer_requests"("positionId");

-- CreateIndex
CREATE INDEX "funds_fundAdminTenantId_idx" ON "funds"("fundAdminTenantId");

-- CreateIndex
CREATE INDEX "subscriptions_fundAdminTenantId_idx" ON "subscriptions"("fundAdminTenantId");

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_fundAdminTenantId_fkey" FOREIGN KEY ("fundAdminTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_closes" ADD CONSTRAINT "fund_closes_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_blocks" ADD CONSTRAINT "signature_blocks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_block_fulfillments" ADD CONSTRAINT "signature_block_fulfillments_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_block_fulfillments" ADD CONSTRAINT "signature_block_fulfillments_signatureBlockId_fkey" FOREIGN KEY ("signatureBlockId") REFERENCES "signature_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_fundAdminTenantId_fkey" FOREIGN KEY ("fundAdminTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_fundCloseId_fkey" FOREIGN KEY ("fundCloseId") REFERENCES "fund_closes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_sponsorTenantId_fkey" FOREIGN KEY ("sponsorTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_requestedByTenantId_fkey" FOREIGN KEY ("requestedByTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_toInvestorId_fkey" FOREIGN KEY ("toInvestorId") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
