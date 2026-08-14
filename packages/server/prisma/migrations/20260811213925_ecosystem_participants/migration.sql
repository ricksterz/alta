-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdvisorRole" ADD VALUE 'legal_ops';
ALTER TYPE "AdvisorRole" ADD VALUE 'custodian_ops';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentTemplateStatus" ADD VALUE 'pending_legal_review';
ALTER TYPE "DocumentTemplateStatus" ADD VALUE 'rejected';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TenantType" ADD VALUE 'fund_legal';
ALTER TYPE "TenantType" ADD VALUE 'custodian';

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_fundAdminTenantId_fkey";

-- DropIndex
DROP INDEX "subscriptions_fundAdminTenantId_idx";

-- AlterTable
ALTER TABLE "document_templates" ADD COLUMN     "legalRejectionReason" TEXT,
ADD COLUMN     "legalReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "funds" ADD COLUMN     "fundLegalTenantId" TEXT,
ADD COLUMN     "gpEntityName" TEXT,
ADD COLUMN     "issuerEin" TEXT,
ADD COLUMN     "issuerJurisdiction" TEXT,
ADD COLUMN     "issuerLegalName" TEXT;

-- CreateTable
CREATE TABLE "subscription_participants" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantType" NOT NULL,
    "addedByRepId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_participants_tenantId_idx" ON "subscription_participants"("tenantId");

-- CreateIndex
CREATE INDEX "subscription_participants_subscriptionId_idx" ON "subscription_participants"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_participants_subscriptionId_tenantId_key" ON "subscription_participants"("subscriptionId", "tenantId");

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_fundLegalTenantId_fkey" FOREIGN KEY ("fundLegalTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_participants" ADD CONSTRAINT "subscription_participants_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: carry forward existing fund-admin routing before the column
-- that held it is dropped. Every subscription that had fundAdminTenantId set
-- gets an equivalent participant row.
INSERT INTO "subscription_participants" ("id", "subscriptionId", "tenantId", "role", "addedAt")
SELECT gen_random_uuid(), "id", "fundAdminTenantId", 'fund_admin', now()
FROM "subscriptions"
WHERE "fundAdminTenantId" IS NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "fundAdminTenantId";

-- AddForeignKey
ALTER TABLE "subscription_participants" ADD CONSTRAINT "subscription_participants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

