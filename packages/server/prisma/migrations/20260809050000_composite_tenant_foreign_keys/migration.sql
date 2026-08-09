-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_investorId_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_investorId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "investors_tenantId_id_key" ON "investors"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_tenantId_subscriptionId_key" ON "positions"("tenantId", "subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_id_key" ON "subscriptions"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_investorId_fkey" FOREIGN KEY ("tenantId", "investorId") REFERENCES "investors"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_tenantId_investorId_fkey" FOREIGN KEY ("tenantId", "investorId") REFERENCES "investors"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_tenantId_subscriptionId_fkey" FOREIGN KEY ("tenantId", "subscriptionId") REFERENCES "subscriptions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

