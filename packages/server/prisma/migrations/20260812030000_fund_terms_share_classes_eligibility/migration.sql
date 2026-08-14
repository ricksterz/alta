-- CreateEnum
CREATE TYPE "FundAssetClass" AS ENUM ('private_equity', 'venture_capital', 'private_credit', 'real_estate', 'infrastructure', 'hedge_fund', 'fund_of_funds');

-- CreateEnum
CREATE TYPE "FundStrategyType" AS ENUM ('buyout', 'growth_equity', 'venture', 'credit', 'real_estate', 'infrastructure', 'secondaries', 'fund_of_funds', 'other');

-- CreateEnum
CREATE TYPE "ManagementFeeBasis" AS ENUM ('commitments', 'invested_capital', 'nav');

-- CreateEnum
CREATE TYPE "WaterfallType" AS ENUM ('european', 'american', 'hybrid');

-- AlterTable
ALTER TABLE "funds" ADD COLUMN     "assetClass" "FundAssetClass",
ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "erisaEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fundFamily" TEXT,
ADD COLUMN     "fundNumber" TEXT,
ADD COLUMN     "gpConsentRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hardCap" DECIMAL(18,2),
ADD COLUMN     "iraEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lei" TEXT,
ADD COLUMN     "lockupMonths" INTEGER,
ADD COLUMN     "nonUsInvestorsPermitted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rofrApplies" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "strategy" "FundStrategyType",
ADD COLUMN     "targetSize" DECIMAL(18,2),
ADD COLUMN     "taxExemptEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "transferrable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vintageYear" INTEGER;

-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "isErisaPlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isIraAccount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTaxExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxResidencyCountry" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "shareClassId" TEXT;

-- CreateTable
CREATE TABLE "fund_terms" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "managementFeeRate" DECIMAL(6,4),
    "managementFeeBasis" "ManagementFeeBasis",
    "carriedInterestRate" DECIMAL(6,4),
    "hurdleRate" DECIMAL(6,4),
    "catchUpRate" DECIMAL(6,4),
    "waterfallType" "WaterfallType",
    "gpCommitmentPct" DECIMAL(6,4),
    "fundTermYears" INTEGER,
    "extensionYears" INTEGER,
    "investmentPeriodEndDate" TIMESTAMP(3),
    "recyclingPermitted" BOOLEAN,
    "clawbackProvision" BOOLEAN,
    "sourceDocument" TEXT,
    "asOfDate" TIMESTAMP(3),
    "isEstimate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_classes" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "minInvestment" DECIMAL(18,2),
    "managementFeeRate" DECIMAL(6,4),
    "carriedInterestRate" DECIMAL(6,4),
    "closedToNewInvestors" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fund_terms_fundId_key" ON "fund_terms"("fundId");

-- CreateIndex
CREATE INDEX "fund_terms_sponsorTenantId_idx" ON "fund_terms"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "share_classes_sponsorTenantId_idx" ON "share_classes"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "share_classes_fundId_idx" ON "share_classes"("fundId");

-- CreateIndex
CREATE UNIQUE INDEX "share_classes_fundId_name_key" ON "share_classes"("fundId", "name");

-- AddForeignKey
ALTER TABLE "fund_terms" ADD CONSTRAINT "fund_terms_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_classes" ADD CONSTRAINT "share_classes_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_shareClassId_fkey" FOREIGN KEY ("shareClassId") REFERENCES "share_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
