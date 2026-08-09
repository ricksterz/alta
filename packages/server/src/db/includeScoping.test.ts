import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client.js";
import { scopedClient } from "./scopedClient.js";

// The Prisma extension only intercepts TOP-LEVEL operations, so an included
// relation is resolved by foreign key without a second tenant filter. That was
// flagged during the Phase 1 review as a theoretical hole; these tests were
// written to find out whether it was a real one, by walking every include path
// that could plausibly cross a tenant boundary.
//
// What they found: the hole was not reachable through normal use. An advisor
// cannot query Fund at all, and a sponsor seeing every firm's subscriptions to
// its own fund is correct rather than a leak. The only way to exploit it was a
// foreign key that ALREADY pointed across tenants — which the database had no
// way to prevent.
//
// So the fix went to the root: same-tenant relations are now composite foreign
// keys on (tenantId, id), and the bad row can no longer be written. The last
// describe block asserts that. The one deliberately cross-tenant reference,
// Subscription.fundId, stays code-enforced via the entitlement check.

const T = {
  advisorA: "dddddddd-0000-4000-8000-000000000001",
  advisorB: "dddddddd-0000-4000-8000-000000000002",
  sponsor: "eeeeeeee-0000-4000-8000-000000000001",
};

let sharedFund = "";
let subFromA = "";
let subFromB = "";

beforeAll(async () => {
  for (const [key, id] of Object.entries(T)) {
    await prisma.tenant.create({
      data: {
        id,
        name: `Inc ${key}`,
        slug: `inc-${key}`,
        type: key.startsWith("advisor") ? "advisor_firm" : "sponsor_firm",
      },
    });
  }

  const reps: Record<string, string> = {};
  for (const [key, tenantId] of Object.entries(T)) {
    const rep = await prisma.advisorRep.create({
      data: {
        tenantId,
        email: `${key}@include.test`,
        passwordHash: "x",
        firstName: key,
        lastName: "Inc",
        role: key.startsWith("advisor") ? "advisor_admin" : "gp_ops",
      },
    });
    reps[key] = rep.id;
  }

  // ONE fund, offered to BOTH advisor firms — the shape that makes
  // Fund.subscriptions span tenants.
  const fund = await prisma.fund.create({
    data: {
      sponsorTenantId: T.sponsor,
      name: "Shared Fund",
      vehicleType: "lp",
      structure: "drawdown",
      exclusion: "section_3c7",
    },
  });
  sharedFund = fund.id;

  for (const firm of ["advisorA", "advisorB"] as const) {
    const inv = await prisma.investor.create({
      data: {
        tenantId: T[firm],
        type: "entity",
        entityName: `Investor of ${firm}`,
        createdByRepId: reps[firm]!,
      },
    });
    const sub = await prisma.subscription.create({
      data: {
        tenantId: T[firm],
        sponsorTenantId: T.sponsor,
        investorId: inv.id,
        fundId: fund.id,
        createdByRepId: reps[firm]!,
        amount: 500_000,
      },
    });
    if (firm === "advisorA") subFromA = sub.id;
    else subFromB = sub.id;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("include paths that cross tenant boundaries", () => {
  it("an advisor firm cannot reach Fund at all, so cannot include its subscriptions", async () => {
    // The first line of defence: Fund is sponsor-owned, so an advisor's scoped
    // client filters it by sponsorTenantId = its own id and matches nothing.
    // The include never gets the chance to run.
    const a = scopedClient(T.advisorA, "advisor_firm");
    const funds = await a.fund.findMany({ include: { subscriptions: true } });
    expect(funds).toHaveLength(0);
  });

  it("a sponsor including Fund.subscriptions sees every firm's — which is correct", async () => {
    // Not a leak: the sponsor owns all of these via sponsorTenantId. Asserted
    // so that if someone later "fixes" this by filtering to one tenant, the
    // change is deliberate rather than accidental.
    const s = scopedClient(T.sponsor, "sponsor_firm");
    const fund = await s.fund.findFirst({
      where: { id: sharedFund },
      include: { subscriptions: true },
    });
    expect(fund!.subscriptions.map((x) => x.id).sort()).toEqual([subFromA, subFromB].sort());
  });

  it("an advisor including Subscription.fund sees the sponsor's fund — intended", async () => {
    // Subscription.fundId legitimately points across the boundary; an advisor
    // must see the fund it subscribed to.
    const a = scopedClient(T.advisorA, "advisor_firm");
    const sub = await a.subscription.findFirst({
      where: { id: subFromA },
      include: { fund: true },
    });
    expect(sub!.fund.name).toBe("Shared Fund");
  });

  it("an advisor including Investor.subscriptions sees only its own", async () => {
    const a = scopedClient(T.advisorA, "advisor_firm");
    const investors = await a.investor.findMany({ include: { subscriptions: true } });
    const allSubs = investors.flatMap((i) => i.subscriptions.map((s) => s.id));
    expect(allSubs).toContain(subFromA);
    expect(allSubs).not.toContain(subFromB);
  });

  it("an advisor cannot reach another firm's subscription via any include from its own tree", async () => {
    // The end-to-end property that matters, stated directly.
    const a = scopedClient(T.advisorA, "advisor_firm");
    const subs = await a.subscription.findMany({
      include: { investor: true, fund: true, documents: true, signatures: true },
    });
    expect(subs.map((s) => s.id)).toEqual([subFromA]);
    for (const s of subs) {
      expect(s.investor.tenantId).toBe(T.advisorA);
    }
  });
});

describe("the FK invariant, now enforced by the database", () => {
  it("refuses to point a subscription at another tenant's investor", async () => {
    // This test previously CHARACTERISED a hole: an include is resolved by
    // foreign key without a second tenant filter, so a cross-tenant FK would
    // have leaked another firm's investor through
    // `subscription.findFirst({ include: { investor: true } })`. Nothing in the
    // database prevented that row from existing — only the discipline of every
    // route sourcing ids from an already tenant-scoped lookup.
    //
    // Subscription.investor is now a composite foreign key on
    // (tenantId, investorId) → investors(tenantId, id), so the bad row cannot
    // be written at all. The include hole is closed at its root rather than
    // patched at the query layer: there is no cross-tenant row left to leak.
    const foreignInvestor = await prisma.investor.findFirst({
      where: { tenantId: T.advisorB },
    });

    await expect(
      prisma.subscription.update({
        where: { id: subFromA },
        data: { investorId: foreignInvestor!.id },
      })
    ).rejects.toThrow(/Foreign key constraint violated/);
  });

  it("still permits the one cross-tenant reference that is intended", async () => {
    // Subscription.fundId legitimately points at a sponsor-owned fund and is
    // deliberately NOT composite — there is no shared tenant column to key on.
    // That reference stays code-enforced via the entitlement check.
    const sub = await prisma.subscription.findUnique({
      where: { id: subFromA },
      include: { fund: true },
    });
    expect(sub!.fund.sponsorTenantId).toBe(T.sponsor);
    expect(sub!.tenantId).toBe(T.advisorA);
  });
});
