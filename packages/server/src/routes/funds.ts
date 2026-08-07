import { Router } from "express";
import { z } from "zod";
import { FundStructure, FundStatus, FundVehicleType } from "@prisma/client";
import { requireAuth, requireSponsorTenant } from "../middleware/requireAuth.js";
import { audit } from "../audit.js";

export const fundsRouter = Router();
fundsRouter.use(requireAuth, requireSponsorTenant);

// ---------------------------------------------------------------------------
// GET /funds — sponsor dashboard: funds + advisor-entitlement count
// ---------------------------------------------------------------------------
fundsRouter.get("/", async (req, res) => {
  const db = req.ctx!.db;
  const funds = await db.fund.findMany({
    orderBy: { createdAt: "desc" },
    include: { advisorEntitlements: { select: { status: true } } },
  });

  res.json(
    funds.map((fund) => ({
      id: fund.id,
      name: fund.name,
      vehicleType: fund.vehicleType,
      structure: fund.structure,
      status: fund.status,
      minInvestment: fund.minInvestment,
      closeDate: fund.closeDate,
      createdAt: fund.createdAt,
      activeEntitlementCount: fund.advisorEntitlements.filter((e) => e.status === "active").length,
      totalEntitlementCount: fund.advisorEntitlements.length,
    }))
  );
});

// ---------------------------------------------------------------------------
// GET /funds/:id
// ---------------------------------------------------------------------------
fundsRouter.get("/:id", async (req, res) => {
  const db = req.ctx!.db;
  const fund = await db.fund.findFirst({
    where: { id: req.params.id },
    include: {
      documentTemplates: {
        orderBy: { uploadedAt: "desc" },
        include: { fieldMappings: { select: { mappingType: true } } },
      },
      advisorEntitlements: { include: { advisorTenant: { select: { id: true, name: true } } } },
    },
  });
  if (!fund) {
    return res.status(404).json({ error: "Fund not found" });
  }

  res.json({
    ...fund,
    documentTemplates: fund.documentTemplates.map((t) => ({
      id: t.id,
      originalFilename: t.originalFilename,
      status: t.status,
      uploadedAt: t.uploadedAt,
      totalFieldCount: t.fieldMappings.length,
      unmappedFieldCount: t.fieldMappings.filter((m) => m.mappingType === "unmapped").length,
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /funds — fund creation form
// ---------------------------------------------------------------------------
const createFundSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  vehicleType: z.nativeEnum(FundVehicleType),
  structure: z.nativeEnum(FundStructure),
  minInvestment: z.number().positive().optional(),
  closeDate: z.string().datetime().optional(),
  gpSignatoryName: z.string().optional(),
});

fundsRouter.post("/", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = createFundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { closeDate, ...rest } = parsed.data;

  if (closeDate && parsed.data.structure !== "drawdown") {
    return res.status(400).json({ error: "closeDate only applies to drawdown funds" });
  }

  const fund = await ctx.db.fund.create({
    data: {
      sponsorTenantId: ctx.tenantId,
      ...rest,
      closeDate: closeDate ? new Date(closeDate) : undefined,
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.created",
    entityType: "Fund",
    entityId: fund.id,
    metadata: { name: fund.name, vehicleType: fund.vehicleType },
  });

  res.status(201).json(fund);
});

// ---------------------------------------------------------------------------
// PATCH /funds/:id — edit fields / status transitions
// ---------------------------------------------------------------------------
const updateFundSchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional(),
  minInvestment: z.number().positive().optional(),
  closeDate: z.string().datetime().optional(),
  gpSignatoryName: z.string().optional(),
  status: z.nativeEnum(FundStatus).optional(),
});

fundsRouter.patch("/:id", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = updateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { closeDate, ...rest } = parsed.data;

  const result = await ctx.db.fund.updateMany({
    where: { id: req.params.id },
    data: { ...rest, closeDate: closeDate ? new Date(closeDate) : undefined },
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Fund not found" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.updated",
    entityType: "Fund",
    entityId: req.params.id,
    metadata: { fields: Object.keys(rest) },
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Advisor entitlements — grant/revoke only, no advisor-side browse UI yet
// ---------------------------------------------------------------------------

fundsRouter.get("/:id/entitlements", async (req, res) => {
  const db = req.ctx!.db;
  const fund = await db.fund.findFirst({ where: { id: req.params.id } });
  if (!fund) {
    return res.status(404).json({ error: "Fund not found" });
  }

  const entitlements = await db.fundAdvisorEntitlement.findMany({
    where: { fundId: fund.id },
    include: { advisorTenant: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(entitlements);
});

const grantEntitlementSchema = z.object({
  advisorTenantId: z.string().uuid(),
});

fundsRouter.post("/:id/entitlements", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = grantEntitlementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const fund = await ctx.db.fund.findFirst({ where: { id: req.params.id } });
  if (!fund) {
    return res.status(404).json({ error: "Fund not found" });
  }

  const advisorTenant = await ctx.db.tenant.findFirst({
    where: { id: parsed.data.advisorTenantId, type: "advisor_firm" },
  });
  if (!advisorTenant) {
    return res.status(400).json({ error: "Advisor tenant not found" });
  }

  const existing = await ctx.db.fundAdvisorEntitlement.findFirst({
    where: { fundId: fund.id, advisorTenantId: advisorTenant.id },
  });

  let entitlementId: string;
  if (existing) {
    await ctx.db.fundAdvisorEntitlement.updateMany({
      where: { id: existing.id },
      data: { status: "active", grantedByRepId: ctx.advisorRepId },
    });
    entitlementId = existing.id;
  } else {
    const created = await ctx.db.fundAdvisorEntitlement.create({
      data: {
        sponsorTenantId: ctx.tenantId,
        fundId: fund.id,
        advisorTenantId: advisorTenant.id,
        grantedByRepId: ctx.advisorRepId,
      },
    });
    entitlementId = created.id;
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.entitlement_granted",
    entityType: "FundAdvisorEntitlement",
    entityId: entitlementId,
    metadata: { fundId: fund.id, advisorTenantId: advisorTenant.id },
  });

  res.status(existing ? 200 : 201).json({ id: entitlementId, status: "active" });
});

const revokeEntitlementSchema = z.object({
  status: z.enum(["active", "revoked"]),
});

fundsRouter.patch("/:id/entitlements/:entitlementId", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = revokeEntitlementSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await ctx.db.fundAdvisorEntitlement.updateMany({
    where: { id: req.params.entitlementId, fundId: req.params.id },
    data: { status: parsed.data.status },
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Entitlement not found" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: parsed.data.status === "active" ? "fund.entitlement_reactivated" : "fund.entitlement_revoked",
    entityType: "FundAdvisorEntitlement",
    entityId: req.params.entitlementId,
    metadata: { fundId: req.params.id },
  });

  res.status(204).end();
});
