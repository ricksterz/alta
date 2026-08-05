-- CreateEnum
CREATE TYPE "AdvisorRole" AS ENUM ('advisor_rep', 'advisor_admin');

-- CreateEnum
CREATE TYPE "InvestorType" AS ENUM ('individual', 'joint', 'entity', 'trust');

-- CreateEnum
CREATE TYPE "AccreditationBasis" AS ENUM ('individual_income', 'individual_net_worth', 'joint_net_worth_spousal_equivalent', 'professional_certification', 'knowledgeable_employee', 'entity_owners_all_accredited', 'entity_assets_over_5m', 'entity_investment_advisor', 'entity_broker_dealer', 'entity_bank_or_savings_institution', 'entity_insurance_company', 'entity_registered_investment_company', 'entity_business_development_company', 'entity_small_business_investment_company', 'entity_erisa_plan', 'entity_government_plan', 'entity_family_office', 'entity_family_client', 'entity_rural_business_investment_company');

-- CreateEnum
CREATE TYPE "PrincipalRole" AS ENUM ('primary', 'joint_owner', 'trustee', 'authorized_signer', 'entity_signer');

-- CreateEnum
CREATE TYPE "TaxFormType" AS ENUM ('w9', 'w8ben');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('draft', 'pending_investor_data', 'pending_signatures', 'pending_gp_countersign', 'pending_fund_admin_review', 'accepted', 'rejected', 'funded');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('advisor_rep', 'system');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisor_reps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "AdvisorRole" NOT NULL DEFAULT 'advisor_rep',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advisor_reps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "advisorRepId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "InvestorType" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "ssnLast4" TEXT,
    "entityName" TEXT,
    "entitySubtype" TEXT,
    "formationJurisdiction" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "accreditationBasis" "AccreditationBasis",
    "accreditationDetails" JSONB,
    "accreditationAttestedAt" TIMESTAMP(3),
    "createdByRepId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_principals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "role" "PrincipalRole" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "title" TEXT,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_principals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_tax_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "formType" "TaxFormType" NOT NULL,
    "w9TaxpayerIdType" TEXT,
    "w9TaxpayerId" TEXT,
    "w9ExemptPayeeCode" TEXT,
    "w9BackupWithholding" BOOLEAN,
    "w8CountryOfCitizenship" TEXT,
    "w8ForeignTaxId" TEXT,
    "w8TreatyCountry" TEXT,
    "w8PermanentResidenceAddr" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accreditation_evidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByRepId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accreditation_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "minimumInvestment" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'draft',
    "amount" DECIMAL(18,2),
    "createdByRepId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "advisor_reps_email_key" ON "advisor_reps"("email");

-- CreateIndex
CREATE INDEX "advisor_reps_tenantId_idx" ON "advisor_reps"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_tenantId_idx" ON "sessions"("tenantId");

-- CreateIndex
CREATE INDEX "sessions_advisorRepId_idx" ON "sessions"("advisorRepId");

-- CreateIndex
CREATE INDEX "investors_tenantId_idx" ON "investors"("tenantId");

-- CreateIndex
CREATE INDEX "investor_principals_tenantId_idx" ON "investor_principals"("tenantId");

-- CreateIndex
CREATE INDEX "investor_principals_investorId_idx" ON "investor_principals"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX "investor_tax_profiles_investorId_key" ON "investor_tax_profiles"("investorId");

-- CreateIndex
CREATE INDEX "investor_tax_profiles_tenantId_idx" ON "investor_tax_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "accreditation_evidence_tenantId_idx" ON "accreditation_evidence"("tenantId");

-- CreateIndex
CREATE INDEX "accreditation_evidence_investorId_idx" ON "accreditation_evidence"("investorId");

-- CreateIndex
CREATE INDEX "funds_tenantId_idx" ON "funds"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_investorId_idx" ON "subscriptions"("investorId");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_entityType_entityId_idx" ON "audit_events"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_tenantId_createdAt_idx" ON "audit_events"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "advisor_reps" ADD CONSTRAINT "advisor_reps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_advisorRepId_fkey" FOREIGN KEY ("advisorRepId") REFERENCES "advisor_reps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investors" ADD CONSTRAINT "investors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investors" ADD CONSTRAINT "investors_createdByRepId_fkey" FOREIGN KEY ("createdByRepId") REFERENCES "advisor_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_principals" ADD CONSTRAINT "investor_principals_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_tax_profiles" ADD CONSTRAINT "investor_tax_profiles_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_evidence" ADD CONSTRAINT "accreditation_evidence_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_evidence" ADD CONSTRAINT "accreditation_evidence_uploadedByRepId_fkey" FOREIGN KEY ("uploadedByRepId") REFERENCES "advisor_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_createdByRepId_fkey" FOREIGN KEY ("createdByRepId") REFERENCES "advisor_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
