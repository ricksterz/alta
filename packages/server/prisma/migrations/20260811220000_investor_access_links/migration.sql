-- CreateTable
CREATE TABLE "investor_access_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "createdByRepId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investor_access_links_tokenHash_key" ON "investor_access_links"("tokenHash");

-- CreateIndex
CREATE INDEX "investor_access_links_tenantId_idx" ON "investor_access_links"("tenantId");

-- CreateIndex
CREATE INDEX "investor_access_links_investorId_idx" ON "investor_access_links"("investorId");

-- AddForeignKey
ALTER TABLE "investor_access_links" ADD CONSTRAINT "investor_access_links_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_access_links" ADD CONSTRAINT "investor_access_links_createdByRepId_fkey" FOREIGN KEY ("createdByRepId") REFERENCES "advisor_reps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

