import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, requireSponsorTenant } from "../middleware/requireAuth.js";
import { audit } from "../audit.js";
import { prisma } from "../db/client.js";

export const capitalCallsRouter = Router();
capitalCallsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /capital-calls — what the caller owes or is owed
// ---------------------------------------------------------------------------
capitalCallsRouter.get("/", async (req, res) => {
  const ctx = req.ctx!;
  const allocations = await ctx.db.capitalCallAllocation.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      capitalCall: { select: { id: true, name: true, callNumber: true, dueDate: true, status: true } },
      position: {
        select: {
          id: true,
          commitmentAmount: true,
          fundedAmount: true,
          fund: { select: { id: true, name: true } },
          investor: {
            select: { id: true, type: true, firstName: true, lastName: true, entityName: true },
          },
        },
      },
    },
  });

  res.json(
    allocations.map((a) => ({
      id: a.id,
      amountDue: a.amountDue,
      amountPaid: a.amountPaid,
      status: a.status,
      paidAt: a.paidAt,
      call: a.capitalCall,
      fund: a.position.fund,
      investor: {
        id: a.position.investor.id,
        displayName:
          a.position.investor.type === "entity" || a.position.investor.type === "trust"
            ? (a.position.investor.entityName ?? "(unnamed)")
            : `${a.position.investor.firstName ?? ""} ${a.position.investor.lastName ?? ""}`.trim(),
      },
      commitmentAmount: a.position.commitmentAmount,
      fundedAmount: a.position.fundedAmount,
    }))
  );
});

// ---------------------------------------------------------------------------
// POST /capital-calls — sponsor issues a call across a fund
// ---------------------------------------------------------------------------
const issueSchema = z.object({
  fundId: z.string().uuid(),
  name: z.string().min(1),
  percentOfCommitment: z.number().positive().max(1),
  noticeDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  purpose: z.string().optional(),
});

capitalCallsRouter.post("/", requireSponsorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const fund = await ctx.db.fund.findFirst({ where: { id: parsed.data.fundId } });
  if (!fund) return res.status(404).json({ error: "Fund not found" });
  if (fund.structure !== "drawdown") {
    return res.status(400).json({
      error:
        "Capital calls apply to drawdown funds. A continuous vehicle takes " +
        "subscriptions in full at each close rather than calling capital over time.",
    });
  }

  // Positions are held across many advisor tenants, so allocating a fund-wide
  // call is a cross-tenant read by necessity — the sponsor is entitled to it,
  // being the party issuing the call. Constrained to this sponsor's own fund.
  const positions = await prisma.position.findMany({
    where: { fundId: fund.id, sponsorTenantId: ctx.tenantId, status: { in: ["active", "partially_transferred"] } },
  });
  if (positions.length === 0) {
    return res.status(400).json({ error: "This fund has no active positions to call against" });
  }

  const pct = new Prisma.Decimal(parsed.data.percentOfCommitment);
  const allocations = positions.map((p) => ({
    tenantId: p.tenantId,
    sponsorTenantId: ctx.tenantId,
    positionId: p.id,
    // Rounded to cents per position. Deliberately not back-solved from a fund
    // total: each holder's notice must be reproducible from its own
    // commitment, and reconciling a rounding remainder across holders is the
    // sponsor's call to make, not something to bury in an allocation loop.
    amountDue: new Prisma.Decimal(p.commitmentAmount).mul(pct).toDecimalPlaces(2),
  }));
  const totalCalled = allocations.reduce(
    (sum, a) => sum.add(a.amountDue),
    new Prisma.Decimal(0)
  );

  const lastCall = await ctx.db.capitalCall.findFirst({
    where: { fundId: fund.id },
    orderBy: { callNumber: "desc" },
  });

  const call = await ctx.db.capitalCall.create({
    data: {
      sponsorTenantId: ctx.tenantId,
      fundId: fund.id,
      callNumber: (lastCall?.callNumber ?? 0) + 1,
      name: parsed.data.name,
      percentOfCommitment: pct,
      totalCalled,
      noticeDate: new Date(parsed.data.noticeDate),
      dueDate: new Date(parsed.data.dueDate),
      purpose: parsed.data.purpose,
      status: "issued",
      issuedAt: new Date(),
    },
  });

  await ctx.db.capitalCallAllocation.createMany({
    data: allocations.map((a) => ({ ...a, capitalCallId: call.id })),
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "capital_call.issued",
    entityType: "CapitalCall",
    entityId: call.id,
    metadata: {
      fundId: fund.id,
      callNumber: call.callNumber,
      percentOfCommitment: parsed.data.percentOfCommitment,
      allocationCount: allocations.length,
      totalCalled: totalCalled.toString(),
    },
  });

  res.status(201).json({
    id: call.id,
    callNumber: call.callNumber,
    totalCalled,
    allocationCount: allocations.length,
  });
});

// ---------------------------------------------------------------------------
// POST /capital-calls/allocations/:id/pay — record receipt
// ---------------------------------------------------------------------------
const paySchema = z.object({ amount: z.number().positive() });

capitalCallsRouter.post("/allocations/:id/pay", requireSponsorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const allocation = await ctx.db.capitalCallAllocation.findFirst({
    where: { id: req.params.id },
    include: { position: true },
  });
  if (!allocation) return res.status(404).json({ error: "Allocation not found" });

  const paid = new Prisma.Decimal(allocation.amountPaid).add(parsed.data.amount);

  // A holder cannot pay more than was called of them. Without this, a
  // fat-fingered amount silently pushes the position's funded total above its
  // commitment — which is not a state a drawdown fund can be in, and which is
  // exactly what happened the first time this ran.
  if (paid.gt(allocation.amountDue)) {
    const remaining = new Prisma.Decimal(allocation.amountDue).sub(allocation.amountPaid);
    return res.status(400).json({
      error:
        `That exceeds the amount called. ${remaining.toFixed(2)} remains outstanding on ` +
        `this allocation.`,
    });
  }

  const fullySettled = paid.gte(allocation.amountDue);

  await ctx.db.capitalCallAllocation.updateMany({
    where: { id: allocation.id },
    data: {
      amountPaid: paid,
      status: fullySettled ? "paid" : "outstanding",
      paidAt: fullySettled ? new Date() : null,
    },
  });

  // Capital received moves the position's funded amount. This is why the model
  // exists: fundedAmount was previously set equal to commitment at funding,
  // which is only true for a continuous vehicle.
  await prisma.position.update({
    where: { id: allocation.positionId },
    data: {
      fundedAmount: new Prisma.Decimal(allocation.position.fundedAmount).add(parsed.data.amount),
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "capital_call.payment_recorded",
    entityType: "CapitalCallAllocation",
    entityId: allocation.id,
    metadata: { amount: parsed.data.amount, fullySettled },
  });

  res.status(204).end();
});
