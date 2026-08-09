import { prisma } from "../db/client.js";

// Opening a position is the one write that must span tenants: the register
// entry belongs to the advisor tenant (who services the investor) AND the
// sponsor tenant (who issues the interest), and it is created by whichever of
// them marks the subscription funded. A tenant-scoped client would stamp only
// the caller's own column and leave the other null, so this uses the raw
// client and sets both explicitly from the subscription it derives from.
//
// Idempotent: Position.subscriptionId is unique, and a repeated funding
// transition must not mint a second holding.
export async function openPositionForSubscription(subscriptionId: string) {
  const existing = await prisma.position.findUnique({ where: { subscriptionId } });
  if (existing) return existing;

  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription) return null;

  return prisma.position.create({
    data: {
      tenantId: subscription.tenantId,
      sponsorTenantId: subscription.sponsorTenantId,
      investorId: subscription.investorId,
      fundId: subscription.fundId,
      subscriptionId: subscription.id,
      commitmentAmount: subscription.amount ?? 0,
      // Drawdown funds call capital over time, so funded ≠ committed in
      // general. Alta has no capital-call model yet, so a funded subscription
      // is recorded as fully funded — revisit when capital calls land.
      fundedAmount: subscription.amount ?? 0,
      status: "active",
      tokenization: "none",
    },
  });
}
