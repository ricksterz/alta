import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client.js";
import { scopedClient } from "./scopedClient.js";

// The isolation guarantee, tested against a real database rather than by
// reading the extension's source. What matters is not that the code contains a
// filter but that a query issued by tenant A cannot return tenant B's row —
// and the only way to know that is to create both rows and ask.
//
// Two advisor firms, two sponsors, one administrator. Firm A subscribes to
// Sponsor A's fund; Firm B subscribes to Sponsor B's. Every assertion below is
// some version of "can the wrong party see it".

const ids = {
  advisorA: "aaaaaaaa-0000-4000-8000-000000000001",
  advisorB: "aaaaaaaa-0000-4000-8000-000000000002",
  sponsorA: "bbbbbbbb-0000-4000-8000-000000000001",
  sponsorB: "bbbbbbbb-0000-4000-8000-000000000002",
  admin: "cccccccc-0000-4000-8000-000000000001",
};

let fundA = "";
let fundB = "";
let subA = "";
let subB = "";

beforeAll(async () => {
  for (const [key, id] of Object.entries(ids)) {
    await prisma.tenant.create({
      data: {
        id,
        name: `Tenant ${key}`,
        slug: `tenant-${key}`,
        type: key.startsWith("advisor")
          ? "advisor_firm"
          : key.startsWith("sponsor")
            ? "sponsor_firm"
            : "fund_admin",
      },
    });
  }

  const reps: Record<string, string> = {};
  for (const [key, tenantId] of Object.entries(ids)) {
    const rep = await prisma.advisorRep.create({
      data: {
        tenantId,
        email: `${key}@isolation.test`,
        passwordHash: "x",
        firstName: key,
        lastName: "Test",
        role: key.startsWith("advisor") ? "advisor_admin" : key.startsWith("sponsor") ? "gp_ops" : "fund_admin_ops",
      },
    });
    reps[key] = rep.id;
  }

  const fa = await prisma.fund.create({
    data: {
      sponsorTenantId: ids.sponsorA,
      fundAdminTenantId: ids.admin, // Sponsor A engages the administrator
      name: "Fund A",
      vehicleType: "lp",
      structure: "drawdown",
      exclusion: "section_3c7",
    },
  });
  const fb = await prisma.fund.create({
    data: {
      sponsorTenantId: ids.sponsorB, // Sponsor B does not
      name: "Fund B",
      vehicleType: "lp",
      structure: "drawdown",
      exclusion: "section_3c7",
    },
  });
  fundA = fa.id;
  fundB = fb.id;

  const invA = await prisma.investor.create({
    data: { tenantId: ids.advisorA, type: "entity", entityName: "Inv A", createdByRepId: reps.advisorA },
  });
  const invB = await prisma.investor.create({
    data: { tenantId: ids.advisorB, type: "entity", entityName: "Inv B", createdByRepId: reps.advisorB },
  });

  const sa = await prisma.subscription.create({
    data: {
      tenantId: ids.advisorA,
      sponsorTenantId: ids.sponsorA,
      fundAdminTenantId: ids.admin,
      investorId: invA.id,
      fundId: fundA,
      createdByRepId: reps.advisorA,
      amount: 1_000_000,
    },
  });
  const sb = await prisma.subscription.create({
    data: {
      tenantId: ids.advisorB,
      sponsorTenantId: ids.sponsorB,
      investorId: invB.id,
      fundId: fundB,
      createdByRepId: reps.advisorB,
      amount: 2_000_000,
    },
  });
  subA = sa.id;
  subB = sb.id;

  await prisma.position.createMany({
    data: [
      { tenantId: ids.advisorA, sponsorTenantId: ids.sponsorA, investorId: invA.id, fundId: fundA, subscriptionId: subA, commitmentAmount: 1_000_000 },
      { tenantId: ids.advisorB, sponsorTenantId: ids.sponsorB, investorId: invB.id, fundId: fundB, subscriptionId: subB, commitmentAmount: 2_000_000 },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("advisor-owned models", () => {
  it("shows a firm only its own investors", async () => {
    const a = scopedClient(ids.advisorA, "advisor_firm");
    const found = await a.investor.findMany();
    expect(found).toHaveLength(1);
    expect(found[0]!.entityName).toBe("Inv A");
  });

  it("returns nothing when firm B fetches firm A's investor by id", async () => {
    const b = scopedClient(ids.advisorB, "advisor_firm");
    const investorA = await prisma.investor.findFirst({ where: { tenantId: ids.advisorA } });
    const found = await b.investor.findFirst({ where: { id: investorA!.id } });
    expect(found).toBeNull();
  });

  it("stamps the caller's tenant on create, ignoring a spoofed tenantId", async () => {
    // A client that sends someone else's tenantId must not land a row there.
    const a = scopedClient(ids.advisorA, "advisor_firm");
    const rep = await prisma.advisorRep.findFirst({ where: { tenantId: ids.advisorA } });
    const created = await a.investor.create({
      data: {
        tenantId: ids.advisorB,
        type: "individual",
        firstName: "Spoof",
        lastName: "Attempt",
        createdByRepId: rep!.id,
      },
    });
    expect(created.tenantId).toBe(ids.advisorA);
    await prisma.investor.delete({ where: { id: created.id } });
  });
});

describe("sponsor-owned models", () => {
  it("shows a sponsor only its own funds", async () => {
    const a = scopedClient(ids.sponsorA, "sponsor_firm");
    const funds = await a.fund.findMany();
    expect(funds.map((f) => f.name)).toEqual(["Fund A"]);
  });

  it("hides one sponsor's fund from another", async () => {
    const b = scopedClient(ids.sponsorB, "sponsor_firm");
    expect(await b.fund.findFirst({ where: { id: fundA } })).toBeNull();
  });

  it("returns nothing when an advisor queries funds — it is never a sponsor", async () => {
    const a = scopedClient(ids.advisorA, "advisor_firm");
    expect(await a.fund.findMany()).toHaveLength(0);
  });
});

describe("multi-owned Subscription", () => {
  it("is visible to the advisor firm that created it", async () => {
    const a = scopedClient(ids.advisorA, "advisor_firm");
    const found = await a.subscription.findMany();
    expect(found.map((s) => s.id)).toEqual([subA]);
  });

  it("is visible to the sponsor whose fund it subscribes to", async () => {
    const sa = scopedClient(ids.sponsorA, "sponsor_firm");
    const found = await sa.subscription.findMany();
    expect(found.map((s) => s.id)).toEqual([subA]);
  });

  it("is visible to the engaged fund administrator", async () => {
    const fa = scopedClient(ids.admin, "fund_admin");
    const found = await fa.subscription.findMany();
    expect(found.map((s) => s.id)).toEqual([subA]);
  });

  it("hides one advisor firm's subscription from another", async () => {
    const b = scopedClient(ids.advisorB, "advisor_firm");
    expect(await b.subscription.findFirst({ where: { id: subA } })).toBeNull();
  });

  it("hides one sponsor's subscription from another", async () => {
    const sb = scopedClient(ids.sponsorB, "sponsor_firm");
    expect(await sb.subscription.findFirst({ where: { id: subA } })).toBeNull();
  });

  it("hides a subscription from an administrator not engaged on that fund", async () => {
    // Sponsor B engaged no administrator, so subB carries a null
    // fundAdminTenantId and must not surface for anyone.
    const fa = scopedClient(ids.admin, "fund_admin");
    expect(await fa.subscription.findFirst({ where: { id: subB } })).toBeNull();
  });
});

describe("models with no fund-admin ownership column", () => {
  it("refuses rather than silently returning everything", async () => {
    // The dangerous failure would be defaulting to tenantId — which Position
    // has — and leaking every advisor's register to any administrator.
    const fa = scopedClient(ids.admin, "fund_admin");
    await expect(fa.position.findMany()).rejects.toThrow(/not visible to a fund_admin tenant/);
  });

  it("still scopes positions correctly for advisor and sponsor", async () => {
    const a = scopedClient(ids.advisorA, "advisor_firm");
    const sb = scopedClient(ids.sponsorB, "sponsor_firm");
    expect(await a.position.findMany()).toHaveLength(1);
    expect(await sb.position.findMany()).toHaveLength(1);
    expect((await a.position.findMany())[0]!.fundId).toBe(fundA);
    expect((await sb.position.findMany())[0]!.fundId).toBe(fundB);
  });
});

describe("banned single-record operations", () => {
  it("blocks findUnique, which cannot carry a tenant filter", async () => {
    const a = scopedClient(ids.advisorA, "advisor_firm");
    await expect(a.subscription.findUnique({ where: { id: subB } })).rejects.toThrow(
      /is disabled on the tenant-scoped client/
    );
  });

  it("blocks update and delete for the same reason", async () => {
    const a = scopedClient(ids.advisorA, "advisor_firm");
    await expect(
      a.subscription.update({ where: { id: subB }, data: { amount: 1 } })
    ).rejects.toThrow(/disabled/);
    await expect(a.subscription.delete({ where: { id: subB } })).rejects.toThrow(/disabled/);
  });

  it("permits the *Many equivalents, still scoped", async () => {
    const a = scopedClient(ids.advisorA, "advisor_firm");
    // Targets firm B's subscription by id — must match zero rows, not one.
    const result = await a.subscription.updateMany({
      where: { id: subB },
      data: { amount: 999 },
    });
    expect(result.count).toBe(0);
  });
});
