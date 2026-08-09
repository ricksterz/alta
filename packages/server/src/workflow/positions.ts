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
    include: { fund: { select: { structure: true } } },
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
      // A continuous vehicle takes the full subscription at its close, so
      // committed and funded coincide. A drawdown fund calls capital over the
      // fund's life, so a new position starts at zero funded and rises as
      // calls are paid — see routes/capitalCalls.ts.
      fundedAmount:
        subscription.fund.structure === "continuous" ? (subscription.amount ?? 0) : 0,
      status: "active",
      tokenization: "none",
    },
  });
}
