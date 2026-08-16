import { Router } from "express";
import { z } from "zod";
import {
  FundAssetClass,
  FundStructure,
  FundStatus,
  FundStrategyType,
  FundVehicleType,
  ManagementFeeBasis,
  WaterfallType,
} from "@prisma/client";
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
      vintageYear: fund.vintageYear,
      assetClass: fund.assetClass,
      strategy: fund.strategy,
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
      terms: true,
      shareClasses: { orderBy: { name: "asc" } },
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
// Identity/offering and eligibility/transfer fields are shared between
// create and update — a sponsor sets some at creation and the rest later, so
// both schemas accept the same optional set rather than splitting them by
// when they're typically filled in.
const fundIdentityFields = {
  vintageYear: z.number().int().min(1900).max(2100).optional(),
  fundFamily: z.string().optional(),
  fundNumber: z.string().optional(),
  assetClass: z.nativeEnum(FundAssetClass).optional(),
  strategy: z.nativeEnum(FundStrategyType).optional(),
  baseCurrency: z.string().length(3).optional(),
  lei: z.string().optional(),
  targetSize: z.number().positive().optional(),
  hardCap: z.number().positive().optional(),
};

const fundEligibilityFields = {
  erisaEligible: z.boolean().optional(),
  iraEligible: z.boolean().optional(),
  nonUsInvestorsPermitted: z.boolean().optional(),
  taxExemptEligible: z.boolean().optional(),
};

const fundTransferFields = {
  transferrable: z.boolean().optional(),
  gpConsentRequired: z.boolean().optional(),
  rofrApplies: z.boolean().optional(),
  lockupMonths: z.number().int().nonnegative().optional(),
};

const createFundSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  vehicleType: z.nativeEnum(FundVehicleType),
  structure: z.nativeEnum(FundStructure),
  minInvestment: z.number().positive().optional(),
  closeDate: z.string().datetime().optional(),
  gpSignatoryName: z.string().optional(),
  ...fundIdentityFields,
  ...fundEligibilityFields,
  ...fundTransferFields,
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
  ...fundIdentityFields,
  ...fundEligibilityFields,
  ...fundTransferFields,
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
// PATCH /funds/:id/terms — economics (fee, carry, hurdle, term). Upsert
// rather than requiring a separate create step: a GP sets these whenever the
// LPA is final, which is often well after the fund itself exists in Alta.
// ---------------------------------------------------------------------------
const updateFundTermsSchema = z.object({
  managementFeeRate: z.number().min(0).optional(),
  managementFeeBasis: z.nativeEnum(ManagementFeeBasis).optional(),
  carriedInterestRate: z.number().min(0).optional(),
  hurdleRate: z.number().min(0).optional(),
  catchUpRate: z.number().min(0).optional(),
  waterfallType: z.nativeEnum(WaterfallType).optional(),
  gpCommitmentPct: z.number().min(0).optional(),
  fundTermYears: z.number().int().positive().optional(),
  extensionYears: z.number().int().nonnegative().optional(),
  investmentPeriodEndDate: z.string().datetime().optional(),
  recyclingPermitted: z.boolean().optional(),
  clawbackProvision: z.boolean().optional(),
  sourceDocument: z.string().optional(),
  asOfDate: z.string().datetime().optional(),
  isEstimate: z.boolean().optional(),
});

fundsRouter.patch("/:id/terms", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = updateFundTermsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const fund = await ctx.db.fund.findFirst({ where: { id: req.params.id } });
  if (!fund) {
    return res.status(404).json({ error: "Fund not found" });
  }

  const { investmentPeriodEndDate, asOfDate, ...rest } = parsed.data;
  const data = {
    ...rest,
    investmentPeriodEndDate: investmentPeriodEndDate ? new Date(investmentPeriodEndDate) : undefined,
    asOfDate: asOfDate ? new Date(asOfDate) : undefined,
  };

  // upsert is banned on the tenant-scoped client (its `where` must be a bare
  // unique selector, which can't carry a tenant filter) — find-then-create-
  // or-updateMany instead, the same pattern grantEntitlement below uses.
  const existingTerms = await ctx.db.fundTerms.findFirst({ where: { fundId: fund.id } });
  let terms;
  if (existingTerms) {
    await ctx.db.fundTerms.updateMany({ where: { id: existingTerms.id }, data });
    terms = { ...existingTerms, ...data };
  } else {
    terms = await ctx.db.fundTerms.create({
      data: { sponsorTenantId: ctx.tenantId, fundId: fund.id, ...data },
    });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.terms_updated",
    entityType: "Fund",
    entityId: fund.id,
    metadata: { fields: Object.keys(rest) },
  });

  res.json(terms);
});

// ---------------------------------------------------------------------------
// Share classes — Class A/I/Founder, when a fund offers more than one
// ---------------------------------------------------------------------------
const createShareClassSchema = z.object({
  name: z.string().min(1),
  currency: z.string().length(3).optional(),
  minInvestment: z.number().positive().optional(),
  managementFeeRate: z.number().min(0).optional(),
  carriedInterestRate: z.number().min(0).optional(),
});

fundsRouter.post("/:id/share-classes", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = createShareClassSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const fund = await ctx.db.fund.findFirst({ where: { id: req.params.id } });
  if (!fund) {
    return res.status(404).json({ error: "Fund not found" });
  }

  const existing = await ctx.db.shareClass.findFirst({
    where: { fundId: fund.id, name: parsed.data.name },
  });
  if (existing) {
    return res.status(400).json({ error: `A share class named "${parsed.data.name}" already exists` });
  }

  const shareClass = await ctx.db.shareClass.create({
    data: { sponsorTenantId: ctx.tenantId, fundId: fund.id, ...parsed.data },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.share_class_created",
    entityType: "ShareClass",
    entityId: shareClass.id,
    metadata: { fundId: fund.id, name: shareClass.name },
  });

  res.status(201).json(shareClass);
});

const updateShareClassSchema = z.object({
  currency: z.string().length(3).optional(),
  minInvestment: z.number().positive().optional(),
  managementFeeRate: z.number().min(0).optional(),
  carriedInterestRate: z.number().min(0).optional(),
  closedToNewInvestors: z.boolean().optional(),
});

fundsRouter.patch("/:id/share-classes/:classId", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = updateShareClassSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await ctx.db.shareClass.updateMany({
    where: { id: req.params.classId, fundId: req.params.id },
    data: parsed.data,
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Share class not found" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.share_class_updated",
    entityType: "ShareClass",
    entityId: req.params.classId,
    metadata: { fundId: req.params.id, fields: Object.keys(parsed.data) },
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Fund closes — subscription windows
// ---------------------------------------------------------------------------
// Drawdown funds have a handful of these; evergreen/continuous funds have a
// recurring cadence. Both use the same model, which is why Fund.closeDate
// (drawdown-only, single) is no longer sufficient on its own.

fundsRouter.get("/:id/closes", async (req, res) => {
  const db = req.ctx!.db;
  const closes = await db.fundClose.findMany({
    where: { fundId: req.params.id },
    orderBy: { closeDate: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });
  res.json(
    closes.map((c) => ({
      id: c.id,
      name: c.name,
      closeDate: c.closeDate,
      status: c.status,
      targetAmount: c.targetAmount,
      subscriptionCount: c._count.subscriptions,
    }))
  );
});

const createCloseSchema = z.object({
  name: z.string().min(1),
  closeDate: z.string().datetime(),
  targetAmount: z.number().positive().optional(),
});

fundsRouter.post("/:id/closes", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = createCloseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const fund = await ctx.db.fund.findFirst({ where: { id: req.params.id } });
  if (!fund) return res.status(404).json({ error: "Fund not found" });

  const close = await ctx.db.fundClose.create({
    data: {
      sponsorTenantId: ctx.tenantId,
      fundId: fund.id,
      name: parsed.data.name,
      closeDate: new Date(parsed.data.closeDate),
      targetAmount: parsed.data.targetAmount,
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.close_created",
    entityType: "FundClose",
    entityId: close.id,
    metadata: { fundId: fund.id, name: close.name, closeDate: close.closeDate },
  });

  res.status(201).json(close);
});

const updateCloseSchema = z.object({ status: z.enum(["open", "closed", "cancelled"]) });

fundsRouter.patch("/:id/closes/:closeId", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = updateCloseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await ctx.db.fundClose.updateMany({
    where: { id: req.params.closeId, fundId: req.params.id },
    data: { status: parsed.data.status },
  });
  if (result.count === 0) return res.status(404).json({ error: "Close not found" });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "fund.close_status_changed",
    entityType: "FundClose",
    entityId: req.params.closeId,
    metadata: { status: parsed.data.status },
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

  // "advisorTenantId" also accepts an investor_direct tenant: a GP granting
  // access directly to one investor uses the same entitlement mechanism as
  // granting it to an advisor firm — see FundAdvisorEntitlement's schema
  // comment.
  const advisorTenant = await ctx.db.tenant.findFirst({
    where: { id: parsed.data.advisorTenantId, type: { in: ["advisor_firm", "investor_direct"] } },
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
