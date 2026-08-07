/*
  Warnings:

  - Added the required column `sponsorTenantId` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DocumentProviderKind" AS ENUM ('local', 'anvil');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('investor_signer', 'gp_countersigner');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('pending', 'signed', 'declined');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "countersignedAt" TIMESTAMP(3),
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "fundedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "sponsorTenantId" TEXT NOT NULL,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "provider" "DocumentProviderKind" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fieldValues" JSONB NOT NULL,
    "unresolvedFields" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorTenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "role" "SignerRole" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "investorPrincipalId" TEXT,
    "advisorRepId" TEXT,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "status" "SignatureStatus" NOT NULL DEFAULT 'pending',
    "signedAt" TIMESTAMP(3),
    "typedName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_documents_tenantId_idx" ON "subscription_documents"("tenantId");

-- CreateIndex
CREATE INDEX "subscription_documents_sponsorTenantId_idx" ON "subscription_documents"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "subscription_documents_subscriptionId_idx" ON "subscription_documents"("subscriptionId");

-- CreateIndex
CREATE INDEX "signature_requests_tenantId_idx" ON "signature_requests"("tenantId");

-- CreateIndex
CREATE INDEX "signature_requests_sponsorTenantId_idx" ON "signature_requests"("sponsorTenantId");

-- CreateIndex
CREATE INDEX "signature_requests_subscriptionId_idx" ON "signature_requests"("subscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_sponsorTenantId_idx" ON "subscriptions"("sponsorTenantId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_sponsorTenantId_fkey" FOREIGN KEY ("sponsorTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_documents" ADD CONSTRAINT "subscription_documents_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_documents" ADD CONSTRAINT "subscription_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "subscription_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_investorPrincipalId_fkey" FOREIGN KEY ("investorPrincipalId") REFERENCES "investor_principals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_advisorRepId_fkey" FOREIGN KEY ("advisorRepId") REFERENCES "advisor_reps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
