-- CreateEnum
CREATE TYPE "QualifiedPurchaserBasis" AS ENUM ('natural_person_5m', 'family_company_5m', 'trust_qp_settlors', 'institutional_25m', 'qualified_institutional_buyer', 'knowledgeable_employee');

-- CreateEnum
CREATE TYPE "FundExclusion" AS ENUM ('section_3c1', 'section_3c7');

-- AlterTable
ALTER TABLE "funds" ADD COLUMN     "domicile" TEXT,
ADD COLUMN     "exclusion" "FundExclusion",
ADD COLUMN     "isFeederFund" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMasterFund" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "qpAttestedAt" TIMESTAMP(3),
ADD COLUMN     "qualifiedPurchaserBasis" "QualifiedPurchaserBasis";
