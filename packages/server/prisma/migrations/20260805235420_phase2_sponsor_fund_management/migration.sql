/*
  Warnings:

  - You are about to drop the column `minimumInvestment` on the `funds` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `funds` table. All the data in the column will be lost.
  - Added the required column `sponsorTenantId` to the `funds` table without a default value. This is not possible if the table is not empty.
  - Added the required column `structure` to the `funds` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleType` to the `funds` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('advisor_firm', 'sponsor_firm');

-- CreateEnum
CREATE TYPE "FundVehicleType" AS ENUM ('lp', 'llc_feeder', 'interval_fund', 'non_traded_bdc', 'evergreen');

-- CreateEnum
CREATE TYPE "FundStructure" AS ENUM ('drawdown', 'continuous');

-- CreateEnum
CREATE TYPE "FundStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('processing', 'ready', 'archived');

-- CreateEnum
CREATE TYPE "FieldMappingType" AS ENUM ('canonical', 'static_value', 'unmapped');

-- AlterEnum
ALTER TYPE "AccreditationBasis" ADD VALUE 'director_officer_or_gp_of_issuer';

-- AlterEnum
ALTER TYPE "AdvisorRole" ADD VALUE 'gp_ops';

-- DropForeignKey
ALTER TABLE "funds" DROP CONSTRAINT "funds_tenantId_fkey";

-- DropIndex
DROP INDEX "funds_tenantId_idx";

-- AlterTable
ALTER TABLE "funds" DROP COLUMN "minimumInvestment",
DROP COLUMN "tenantId",
ADD COLUMN     "closeDate" TIMESTAMP(3),
ADD COLUMN     "gpSignatoryName" TEXT,
ADD COLUMN     "minInvestment" DECIMAL(18,2),
ADD COLUMN     "sponsorTenantId" TEXT NOT NULL,
ADD COLUMN     "status" "FundStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "structure" "FundStructure" NOT NULL,
ADD COLUMN     "vehicleType" "FundVehicleType" NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "type" "TenantType" NOT NULL DEFAULT 'advisor_firm';

-- CreateTable
CREATE TABLE "fund_advisor_entitlements" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "advisorTenantId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'active',
    "grantedByRepId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fund_advisor_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "anvilTemplateId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'processing',
    "detectedFieldsRaw" JSONB NOT NULL,
    "uploadedByRepId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_mappings" (
    "id" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "anvilFieldKey" TEXT NOT NULL,
    "anvilFieldLabel" TEXT,
    "mappingType" "FieldMappingType" NOT NULL DEFAULT 'unmapped',
    "canonicalField" TEXT,
    "staticValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fund_advisor_entitlements_sponsorTenantId_idx" ON "fund_advisor_entitlements"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "fund_advisor_entitlements_advisorTenantId_idx" ON "fund_advisor_entitlements"("advisorTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "fund_advisor_entitlements_fundId_advisorTenantId_key" ON "fund_advisor_entitlements"("fundId", "advisorTenantId");

-- CreateIndex
CREATE INDEX "document_templates_sponsorTenantId_idx" ON "document_templates"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "document_templates_fundId_idx" ON "document_templates"("fundId");

-- CreateIndex
CREATE INDEX "field_mappings_sponsorTenantId_idx" ON "field_mappings"("sponsorTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "field_mappings_templateId_anvilFieldKey_key" ON "field_mappings"("templateId", "anvilFieldKey");

-- CreateIndex
CREATE INDEX "funds_sponsorTenantId_idx" ON "funds"("sponsorTenantId");

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_sponsorTenantId_fkey" FOREIGN KEY ("sponsorTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_advisor_entitlements" ADD CONSTRAINT "fund_advisor_entitlements_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_advisor_entitlements" ADD CONSTRAINT "fund_advisor_entitlements_advisorTenantId_fkey" FOREIGN KEY ("advisorTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_advisor_entitlements" ADD CONSTRAINT "fund_advisor_entitlements_sponsorTenantId_fkey" FOREIGN KEY ("sponsorTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_advisor_entitlements" ADD CONSTRAINT "fund_advisor_entitlements_grantedByRepId_fkey" FOREIGN KEY ("grantedByRepId") REFERENCES "advisor_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_sponsorTenantId_fkey" FOREIGN KEY ("sponsorTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_uploadedByRepId_fkey" FOREIGN KEY ("uploadedByRepId") REFERENCES "advisor_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_sponsorTenantId_fkey" FOREIGN KEY ("sponsorTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
