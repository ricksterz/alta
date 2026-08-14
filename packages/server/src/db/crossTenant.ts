import { prisma } from "./client.js";

// Deliberate, named exceptions to tenant scoping.
//
// The scoped client gives each model exactly one owning column per caller
// type, which is right almost everywhere. But an entitlement-based platform
// has a handful of reads that must cross the boundary by design: an advisor
// firm asking "which sponsor funds may I offer?" is legitimately reading
// sponsor-owned rows, and its scoped client would filter those by
// sponsorTenantId — its own id — and correctly return nothing.
//
// Rather than let route handlers reach for the raw client (which is how
// isolation bugs get introduced one convenient shortcut at a time), every
// such read lives here as a named function that: takes the caller's tenant id
// as an explicit argument, constrains on it, and documents why crossing is
// safe. If a function can't state that, it doesn't belong here.

/** Funds a given advisor tenant has been granted an active entitlement to.
 *  Safe: constrained to advisorTenantId = the caller's own tenant. */
export function fundsEntitledToAdvisor(advisorTenantId: string) {
  return prisma.fundAdvisorEntitlement.findMany({
    where: { advisorTenantId, status: "active" },
    include: {
      fund: {
        include: {
          documentTemplates: {
            where: { status: "ready" },
            include: { fieldMappings: { select: { mappingType: true } } },
          },
          terms: true,
          shareClasses: { where: { closedToNewInvestors: false }, orderBy: { name: "asc" } },
        },
      },
    },
  });
}

/** A single active entitlement, used to authorize subscribing to a fund.
 *  Safe: constrained to advisorTenantId = the caller's own tenant, so an
 *  advisor can only ever confirm entitlements granted to itself. */
export function activeEntitlement(advisorTenantId: string, fundId: string) {
  return prisma.fundAdvisorEntitlement.findFirst({
    where: { advisorTenantId, fundId, status: "active" },
    include: { fund: { include: { terms: true, shareClasses: true } } },
  });
}

/** The current ready template for a fund, for document generation.
 *  Safe: callers must first prove entitlement to fundId via activeEntitlement,
 *  and a template is inseparable from the fund it belongs to — an advisor
 *  entitled to offer a fund is necessarily entitled to generate its docs. */
export function readyTemplateForFund(fundId: string) {
  return prisma.documentTemplate.findFirst({
    where: { fundId, status: "ready" },
    orderBy: { uploadedAt: "desc" },
    include: { fieldMappings: true },
  });
}

/** The next open close for a fund, by date. Safe: a fund's close calendar is
 *  offering information any entitled advisor legitimately sees, and callers
 *  must already have proven entitlement to reach this. */
export function nextOpenClose(fundId: string) {
  return prisma.fundClose.findFirst({
    where: { fundId, status: "open" },
    orderBy: { closeDate: "asc" },
  });
}

/** Attaches a fund admin or custodian as a participant on a subscription.
 *  Safe: the subscriptionId a caller can supply is already constrained to
 *  subscriptions the caller's own scoped client can see, and the tenantId
 *  attached comes from trusted state (Fund.fundAdminTenantId, or a custodian
 *  explicitly chosen through its own authorized route) rather than arbitrary
 *  client input. SubscriptionParticipant can't use the normal scoped-create
 *  path because the tenant being written is a third party, not the caller. */
export function addSubscriptionParticipant(params: {
  subscriptionId: string;
  tenantId: string;
  role: "fund_admin" | "custodian";
  addedByRepId?: string | null;
}) {
  return prisma.subscriptionParticipant.create({
    data: {
      subscriptionId: params.subscriptionId,
      tenantId: params.tenantId,
      role: params.role,
      addedByRepId: params.addedByRepId ?? null,
    },
  });
}

/** A fund's full close calendar, for display alongside an offering. */
export function closesForFund(fundId: string) {
  return prisma.fundClose.findMany({
    where: { fundId },
    orderBy: { closeDate: "asc" },
  });
}
