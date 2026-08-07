import fs from "node:fs";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { SubscriptionStatus } from "@prisma/client";
import {
  requireAdvisorTenant,
  requireAuth,
  requireSponsorTenant,
} from "../middleware/requireAuth.js";
import type { RequestContext } from "../types/express.js";
import { audit } from "../audit.js";
import { CANONICAL_FIELDS } from "../canonicalFields.js";
import {
  activeEntitlement,
  fundsEntitledToAdvisor,
  readyTemplateForFund,
} from "../db/crossTenant.js";
import { resolveFields } from "../workflow/resolveFields.js";
import { getDocumentProvider } from "../workflow/documentProvider.js";
import {
  STATUS_TIMESTAMP,
  TransitionError,
  allowedNext,
  assertTransition,
} from "../workflow/subscriptionStatus.js";

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireAuth);

function investorDisplayName(inv: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  entityName: string | null;
}) {
  return inv.type === "entity" || inv.type === "trust"
    ? (inv.entityName ?? "(unnamed)")
    : `${inv.firstName ?? ""} ${inv.lastName ?? ""}`.trim() || "(unnamed)";
}

// Applies a status transition with its timestamp and audit event. Every status
// change goes through here so the state machine can't be bypassed by a route
// setting `status` directly.
async function transitionTo(
  ctx: RequestContext,
  subscription: { id: string; status: SubscriptionStatus },
  to: SubscriptionStatus,
  extraData: Record<string, unknown> = {},
  extraMetadata: Record<string, unknown> = {}
) {
  const rule = assertTransition(subscription.status, to, ctx.tenantType);
  const stamp = STATUS_TIMESTAMP[to];

  await ctx.db.subscription.updateMany({
    where: { id: subscription.id },
    data: { status: to, ...(stamp ? { [stamp]: new Date() } : {}), ...extraData },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "subscription.status_changed",
    entityType: "Subscription",
    entityId: subscription.id,
    metadata: { from: subscription.status, to, label: rule.label, ...extraMetadata },
  });
}

// ---------------------------------------------------------------------------
// GET /subscriptions/available-funds — advisor: funds this firm may offer
// ---------------------------------------------------------------------------
subscriptionsRouter.get("/available-funds", requireAdvisorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const entitlements = await fundsEntitledToAdvisor(ctx.tenantId);

  res.json(
    entitlements
      .filter((e) => e.fund.status === "active")
      .map((e) => {
        const template = e.fund.documentTemplates[0];
        return {
          id: e.fund.id,
          name: e.fund.name,
          legalName: e.fund.legalName,
          vehicleType: e.fund.vehicleType,
          structure: e.fund.structure,
          minInvestment: e.fund.minInvestment,
          closeDate: e.fund.closeDate,
          hasTemplate: Boolean(template),
          templateUnmappedFieldCount: template
            ? template.fieldMappings.filter((m) => m.mappingType === "unmapped").length
            : 0,
        };
      })
  );
});

// ---------------------------------------------------------------------------
// GET /subscriptions — both sides; sponsor sees its funds' subscriptions
// ---------------------------------------------------------------------------
subscriptionsRouter.get("/", async (req, res) => {
  const ctx = req.ctx!;
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;

  const subscriptions = await ctx.db.subscription.findMany({
    where: statusFilter ? { status: statusFilter as SubscriptionStatus } : {},
    orderBy: { createdAt: "desc" },
    include: {
      investor: {
        select: { id: true, type: true, firstName: true, lastName: true, entityName: true },
      },
      fund: { select: { id: true, name: true } },
      tenant: { select: { id: true, name: true } },
    },
  });

  res.json(
    subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      amount: s.amount,
      createdAt: s.createdAt,
      investor: { id: s.investor.id, displayName: investorDisplayName(s.investor) },
      fund: s.fund,
      advisorFirm: s.tenant.name,
      allowedNext: allowedNext(s.status),
    }))
  );
});

// ---------------------------------------------------------------------------
// GET /subscriptions/:id
// ---------------------------------------------------------------------------
subscriptionsRouter.get("/:id", async (req, res) => {
  const ctx = req.ctx!;
  const subscription = await ctx.db.subscription.findFirst({
    where: { id: req.params.id },
    include: {
      investor: true,
      fund: true,
      tenant: { select: { id: true, name: true } },
      documents: { orderBy: { generatedAt: "desc" } },
      signatures: { orderBy: { sequence: "asc" } },
    },
  });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  res.json({
    ...subscription,
    investorDisplayName: investorDisplayName(subscription.investor),
    advisorFirm: subscription.tenant.name,
    allowedNext: allowedNext(subscription.status),
  });
});

// ---------------------------------------------------------------------------
// POST /subscriptions — advisor starts a subscription for an investor
// ---------------------------------------------------------------------------
const createSchema = z.object({
  investorId: z.string().uuid(),
  fundId: z.string().uuid(),
  amount: z.number().positive(),
});

subscriptionsRouter.post("/", requireAdvisorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const investor = await ctx.db.investor.findFirst({
    where: { id: parsed.data.investorId },
    include: { taxProfile: true },
  });
  if (!investor) {
    return res.status(404).json({ error: "Investor not found" });
  }
  if (!investor.accreditationBasis) {
    return res
      .status(400)
      .json({ error: "Investor must complete accreditation before subscribing" });
  }
  if (!investor.taxProfile) {
    return res.status(400).json({ error: "Investor must complete a tax form before subscribing" });
  }

  // Verify entitlement rather than trusting the fundId the client sent —
  // otherwise any advisor tenant could subscribe to any sponsor's fund by id.
  const entitlement = await activeEntitlement(ctx.tenantId, parsed.data.fundId);
  if (!entitlement) {
    return res.status(403).json({ error: "Your firm is not entitled to offer this fund" });
  }
  const fund = entitlement.fund;

  if (fund.minInvestment && parsed.data.amount < Number(fund.minInvestment)) {
    return res.status(400).json({
      error: `Amount is below this fund's ${Number(fund.minInvestment).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} minimum`,
    });
  }

  const subscription = await ctx.db.subscription.create({
    data: {
      tenantId: ctx.tenantId,
      sponsorTenantId: fund.sponsorTenantId,
      investorId: investor.id,
      fundId: fund.id,
      amount: parsed.data.amount,
      status: "draft",
      createdByRepId: ctx.advisorRepId,
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "subscription.created",
    entityType: "Subscription",
    entityId: subscription.id,
    metadata: { investorId: investor.id, fundId: fund.id, amount: parsed.data.amount },
  });

  await transitionTo(ctx, subscription, "pending_investor_data");

  res.status(201).json({ id: subscription.id });
});

// ---------------------------------------------------------------------------
// POST /subscriptions/:id/generate-document
// ---------------------------------------------------------------------------
subscriptionsRouter.post("/:id/generate-document", requireAdvisorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const subscription = await ctx.db.subscription.findFirst({
    where: { id: req.params.id },
    include: { investor: { include: { taxProfile: true, principals: true } }, fund: true },
  });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  const template = await readyTemplateForFund(subscription.fundId);
  if (!template) {
    return res.status(400).json({ error: "This fund has no ready document template" });
  }

  const resolution = resolveFields(
    template.fieldMappings.map((m) => ({
      anvilFieldKey: m.anvilFieldKey,
      mappingType: m.mappingType,
      canonicalField: m.canonicalField,
      staticValue: m.staticValue,
    })),
    { investor: subscription.investor, subscription, fund: subscription.fund }
  );

  const fieldLabels: Record<string, string> = {};
  for (const m of template.fieldMappings) {
    const canonical = CANONICAL_FIELDS.find((f) => f.key === m.canonicalField);
    fieldLabels[m.anvilFieldKey] = canonical?.label ?? m.anvilFieldLabel ?? m.anvilFieldKey;
  }

  const provider = getDocumentProvider();
  const filled = await provider.fill({
    subscriptionId: subscription.id,
    tenantId: ctx.tenantId,
    anvilTemplateId: template.anvilTemplateId,
    originalFilename: template.originalFilename,
    values: resolution.values,
    context: {
      fundName: subscription.fund.legalName ?? subscription.fund.name,
      investorName: investorDisplayName(subscription.investor),
      fieldLabels,
    },
  });

  const unresolvedForRecord = [
    ...resolution.unresolved,
    ...resolution.unmapped.map((k) => ({
      anvilFieldKey: k,
      canonicalField: "(unmapped)",
      reason: "Field was never mapped by the fund sponsor",
    })),
  ];

  const document = await ctx.db.subscriptionDocument.create({
    data: {
      tenantId: ctx.tenantId,
      sponsorTenantId: subscription.sponsorTenantId,
      subscriptionId: subscription.id,
      templateId: template.id,
      provider: filled.provider,
      storagePath: filled.storagePath,
      fieldValues: resolution.values,
      unresolvedFields: unresolvedForRecord,
    },
  });

  // Every investor principal signs, then the GP countersigns. Explicit
  // sequence numbers rather than relying on row order.
  const principals = subscription.investor.principals;
  await ctx.db.signatureRequest.createMany({
    data: principals.map((p, i) => ({
      tenantId: ctx.tenantId,
      sponsorTenantId: subscription.sponsorTenantId,
      subscriptionId: subscription.id,
      documentId: document.id,
      role: "investor_signer" as const,
      sequence: i + 1,
      investorPrincipalId: p.id,
      signerName: `${p.firstName} ${p.lastName}`,
      signerEmail: p.email,
    })),
  });

  await ctx.db.signatureRequest.create({
    data: {
      tenantId: ctx.tenantId,
      sponsorTenantId: subscription.sponsorTenantId,
      subscriptionId: subscription.id,
      documentId: document.id,
      role: "gp_countersigner",
      sequence: principals.length + 1,
      signerName: subscription.fund.gpSignatoryName ?? "Fund General Partner",
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "subscription.document_generated",
    entityType: "SubscriptionDocument",
    entityId: document.id,
    metadata: {
      subscriptionId: subscription.id,
      templateId: template.id,
      provider: filled.provider,
      resolvedFieldCount: Object.keys(resolution.values).length,
      unresolvedFieldCount: resolution.unresolved.length,
      unmappedFieldCount: resolution.unmapped.length,
    },
  });

  await transitionTo(ctx, subscription, "pending_signatures", {}, { documentId: document.id });

  res.status(201).json({
    documentId: document.id,
    resolved: resolution.values,
    unresolved: resolution.unresolved,
    unmapped: resolution.unmapped,
  });
});

// ---------------------------------------------------------------------------
// GET /subscriptions/:id/document — stream the generated PDF
// ---------------------------------------------------------------------------
subscriptionsRouter.get("/:id/document", async (req, res) => {
  const ctx = req.ctx!;
  const document = await ctx.db.subscriptionDocument.findFirst({
    where: { subscriptionId: req.params.id },
    orderBy: { generatedAt: "desc" },
  });
  if (!document || !fs.existsSync(document.storagePath)) {
    return res.status(404).json({ error: "Document not found" });
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="subscription.pdf"`);
  fs.createReadStream(document.storagePath).pipe(res);
});

// ---------------------------------------------------------------------------
// POST /subscriptions/:id/signatures/:sigId/sign
// ---------------------------------------------------------------------------
const signSchema = z.object({ typedName: z.string().min(1) });

subscriptionsRouter.post("/:id/signatures/:sigId/sign", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const subscription = await ctx.db.subscription.findFirst({ where: { id: req.params.id } });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  const signature = await ctx.db.signatureRequest.findFirst({
    where: { id: req.params.sigId, subscriptionId: subscription.id },
  });
  if (!signature) {
    return res.status(404).json({ error: "Signature request not found" });
  }
  if (signature.status !== "pending") {
    return res.status(400).json({ error: `This signature is already ${signature.status}` });
  }

  // Role gate: the GP countersignature belongs to the sponsor tenant, investor
  // signatures to the advisor tenant. Without this, either side could sign the
  // other's block.
  const expectedTenantType = signature.role === "gp_countersigner" ? "sponsor_firm" : "advisor_firm";
  if (ctx.tenantType !== expectedTenantType) {
    return res.status(403).json({
      error:
        signature.role === "gp_countersigner"
          ? "Only the fund sponsor can countersign"
          : "Only the advisor firm can capture investor signatures",
    });
  }

  // Signing order: earlier pending signatures must be completed first.
  const earlierPending = await ctx.db.signatureRequest.count({
    where: {
      subscriptionId: subscription.id,
      status: "pending",
      sequence: { lt: signature.sequence },
    },
  });
  if (earlierPending > 0) {
    return res.status(400).json({ error: "An earlier signer has not signed yet" });
  }

  await ctx.db.signatureRequest.updateMany({
    where: { id: signature.id },
    data: {
      status: "signed",
      signedAt: new Date(),
      typedName: parsed.data.typedName,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      ...(signature.role === "gp_countersigner" ? { advisorRepId: ctx.advisorRepId } : {}),
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "subscription.signed",
    entityType: "SignatureRequest",
    entityId: signature.id,
    metadata: {
      subscriptionId: subscription.id,
      role: signature.role,
      signerName: signature.signerName,
      typedName: parsed.data.typedName,
      ipAddress: req.ip ?? null,
    },
  });

  // Auto-advance once a whole side is done.
  const remainingInvestor = await ctx.db.signatureRequest.count({
    where: { subscriptionId: subscription.id, role: "investor_signer", status: "pending" },
  });

  if (signature.role === "investor_signer" && remainingInvestor === 0) {
    await transitionTo(ctx, subscription, "pending_gp_countersign");
  } else if (signature.role === "gp_countersigner") {
    await transitionTo(ctx, subscription, "pending_fund_admin_review");
  }

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /subscriptions/:id/transition — explicit GP-side decisions
// ---------------------------------------------------------------------------
const transitionSchema = z.object({
  to: z.enum(["accepted", "rejected", "funded"]),
  rejectionReason: z.string().optional(),
});

subscriptionsRouter.post("/:id/transition", requireSponsorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const subscription = await ctx.db.subscription.findFirst({ where: { id: req.params.id } });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }
  if (parsed.data.to === "rejected" && !parsed.data.rejectionReason) {
    return res.status(400).json({ error: "A reason is required when rejecting" });
  }

  const extra =
    parsed.data.to === "rejected" ? { rejectionReason: parsed.data.rejectionReason } : {};
  await transitionTo(ctx, subscription, parsed.data.to, extra, extra);

  res.status(204).end();
});

// Surface state-machine violations with their own message and status rather
// than a generic 500 from the global error handler.
subscriptionsRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof TransitionError) {
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
});
