import fs from "node:fs";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { SubscriptionStatus, TenantType } from "@prisma/client";
import {
  requireAdvisorTenant,
  requireAuth,
  requireCustodianTenant,
  requireSponsorOrFundAdmin,
  requireSponsorTenant,
} from "../middleware/requireAuth.js";
import type { RequestContext } from "../types/express.js";
import { audit } from "../audit.js";
import { CANONICAL_FIELDS } from "../canonicalFields.js";
import {
  activeEntitlement,
  addSubscriptionParticipant,
  fundsEntitledToAdvisor,
  nextOpenClose,
  readyTemplateForFund,
} from "../db/crossTenant.js";
import { checkEligibility } from "../workflow/eligibility.js";
import { holderCapacity } from "../workflow/holderRegister.js";
import { decryptOptional } from "../crypto/fieldEncryption.js";
import { openPositionForSubscription } from "../workflow/positions.js";
import { fulfillBlocksForSigner } from "../workflow/signatureBlocks.js";
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

// fundAdminTenantId used to be a column on Subscription; it's now derived
// from the participant join table (a fund admin is one optional party among
// several, not one of the two parties present on every subscription — see
// SubscriptionParticipant in the schema). Every transitionTo call site must
// fetch its subscription with a `participants` include covering fund_admin
// and custodian, and pass the result through these rather than guessing.
function fundAdminTenantIdOf(participants: { role: string; tenantId: string }[]): string | null {
  return participants.find((p) => p.role === "fund_admin")?.tenantId ?? null;
}
function custodianTenantIdOf(participants: { role: string; tenantId: string }[]): string | null {
  return participants.find((p) => p.role === "custodian")?.tenantId ?? null;
}
const PARTICIPANT_ROLES_FOR_TRANSITIONS = {
  role: { in: ["fund_admin", "custodian"] as TenantType[] },
};

// Applies a status transition with its timestamp and audit event. Every status
// change goes through here so the state machine can't be bypassed by a route
// setting `status` directly.
async function transitionTo(
  ctx: RequestContext,
  subscription: {
    id: string;
    status: SubscriptionStatus;
    fundAdminTenantId: string | null;
    custodianTenantId: string | null;
  },
  to: SubscriptionStatus,
  extraData: Record<string, unknown> = {},
  extraMetadata: Record<string, unknown> = {}
) {
  const rule = assertTransition(
    {
      status: subscription.status,
      fundAdminTenantId: subscription.fundAdminTenantId,
      custodianTenantId: subscription.custodianTenantId,
    },
    to,
    ctx.tenantType
  );
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
          exclusion: e.fund.exclusion,
          domicile: e.fund.domicile,
          vintageYear: e.fund.vintageYear,
          assetClass: e.fund.assetClass,
          strategy: e.fund.strategy,
          managementFeeRate: e.fund.terms?.managementFeeRate ?? null,
          carriedInterestRate: e.fund.terms?.carriedInterestRate ?? null,
          hurdleRate: e.fund.terms?.hurdleRate ?? null,
          shareClasses: e.fund.shareClasses.map((c) => ({
            id: c.id,
            name: c.name,
            currency: c.currency,
            minInvestment: c.minInvestment,
            managementFeeRate: c.managementFeeRate,
            carriedInterestRate: c.carriedInterestRate,
            closedToNewInvestors: c.closedToNewInvestors,
          })),
          hasTemplate: Boolean(template),
          templateUnmappedFieldCount: template
            ? template.fieldMappings.filter((m) => m.mappingType === "unmapped").length
            : 0,
        };
      })
  );
});

// ---------------------------------------------------------------------------
// GET /subscriptions/custodian-tenants?search= — advisor lookup for the
// attach-custodian screen. Tenant is exempt from tenant-scoping, so this is
// unfiltered by caller on purpose, same reasoning as advisorTenants.ts: an
// advisor choosing which custodian to attach needs to see every custodian on
// the platform, not just its own (an advisor has no "own" custodian).
// ---------------------------------------------------------------------------
subscriptionsRouter.get("/custodian-tenants", requireAdvisorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const tenants = await ctx.db.tenant.findMany({
    where: {
      type: "custodian",
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: 25,
  });

  res.json(tenants);
});

// ---------------------------------------------------------------------------
// GET /subscriptions/eligibility?investorId=&fundId= — pre-submit check
// ---------------------------------------------------------------------------
// Same engine the POST uses, exposed so the UI can explain the block before a
// rep fills in an amount rather than after. Advisory only — the POST re-checks.
subscriptionsRouter.get("/eligibility", requireAdvisorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const investorId = typeof req.query.investorId === "string" ? req.query.investorId : null;
  const fundId = typeof req.query.fundId === "string" ? req.query.fundId : null;
  if (!investorId || !fundId) {
    return res.status(400).json({ error: "investorId and fundId are required" });
  }

  const investor = await ctx.db.investor.findFirst({ where: { id: investorId } });
  if (!investor) return res.status(404).json({ error: "Investor not found" });

  const entitlement = await activeEntitlement(ctx.tenantId, fundId);
  if (!entitlement) {
    return res.status(403).json({ error: "Your firm is not entitled to offer this fund" });
  }

  res.json(
    checkEligibility({
      investor: {
        type: investor.type,
        accreditationBasis: investor.accreditationBasis,
        qualifiedPurchaserBasis: investor.qualifiedPurchaserBasis,
        isErisaPlan: investor.isErisaPlan,
        isIraAccount: investor.isIraAccount,
        isTaxExempt: investor.isTaxExempt,
        taxResidencyCountry: investor.taxResidencyCountry,
      },
      fund: {
        exclusion: entitlement.fund.exclusion,
        name: entitlement.fund.name,
        erisaEligible: entitlement.fund.erisaEligible,
        iraEligible: entitlement.fund.iraEligible,
        nonUsInvestorsPermitted: entitlement.fund.nonUsInvestorsPermitted,
        taxExemptEligible: entitlement.fund.taxExemptEligible,
      },
      holderCapacity: await holderCapacity(entitlement.fund.id),
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
      fund: { include: { terms: true } },
      shareClass: true,
      tenant: { select: { id: true, name: true } },
      documents: { orderBy: { generatedAt: "desc" } },
      signatures: {
        orderBy: { sequence: "asc" },
        include: { _count: { select: { fulfillments: true } } },
      },
      participants: { include: { tenant: { select: { id: true, name: true, type: true } } } },
    },
  });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  res.json({
    ...subscription,
    participants: subscription.participants.map((p) => ({
      role: p.role,
      tenant: p.tenant,
    })),
    signatures: subscription.signatures.map((s) => ({
      ...s,
      blocksExecuted: s._count.fulfillments,
    })),
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
  shareClassId: z.string().uuid().optional(),
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

  // Accreditation AND qualified-purchaser eligibility. The UI warns before
  // submit, but this is the authoritative check — a 3(c)(7) fund must not
  // accept a merely-accredited investor regardless of what the client sent.
  const eligibility = checkEligibility({
    investor: {
      type: investor.type,
      accreditationBasis: investor.accreditationBasis,
      qualifiedPurchaserBasis: investor.qualifiedPurchaserBasis,
      isErisaPlan: investor.isErisaPlan,
      isIraAccount: investor.isIraAccount,
      isTaxExempt: investor.isTaxExempt,
      taxResidencyCountry: investor.taxResidencyCountry,
    },
    fund: {
      exclusion: fund.exclusion,
      name: fund.name,
      erisaEligible: fund.erisaEligible,
      iraEligible: fund.iraEligible,
      nonUsInvestorsPermitted: fund.nonUsInvestorsPermitted,
      taxExemptEligible: fund.taxExemptEligible,
    },
    holderCapacity: await holderCapacity(fund.id),
  });
  if (!eligibility.eligible) {
    await audit(ctx.db, ctx.tenantId, {
      actorType: "advisor_rep",
      actorId: ctx.advisorRepId,
      action: "subscription.blocked_ineligible",
      entityType: "Investor",
      entityId: investor.id,
      metadata: {
        fundId: fund.id,
        fundExclusion: fund.exclusion,
        blockers: eligibility.blockers.map((b) => b.code),
      },
    });
    return res.status(403).json({
      error: eligibility.blockers.map((b) => b.message).join(" "),
      blockers: eligibility.blockers,
    });
  }

  // A chosen share class must belong to this fund and still be open — an
  // advisor picking a class id isn't proof it's valid, the same reasoning as
  // re-verifying fundId against entitlement rather than trusting the client.
  let shareClass: (typeof fund.shareClasses)[number] | null = null;
  if (parsed.data.shareClassId) {
    shareClass = fund.shareClasses.find((c) => c.id === parsed.data.shareClassId) ?? null;
    if (!shareClass) {
      return res.status(400).json({ error: "Share class not found on this fund" });
    }
    if (shareClass.closedToNewInvestors) {
      return res.status(400).json({ error: `${shareClass.name} is closed to new investors` });
    }
  }

  const minInvestment = shareClass?.minInvestment ?? fund.minInvestment;
  if (minInvestment && parsed.data.amount < Number(minInvestment)) {
    return res.status(400).json({
      error: `Amount is below this fund's ${Number(minInvestment).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} minimum`,
    });
  }

  // Target the next open close. Drawdown funds typically have a few; evergreen
  // funds have a recurring cadence, which is the case this exists for.
  const nextClose = await nextOpenClose(fund.id);

  const subscription = await ctx.db.subscription.create({
    data: {
      tenantId: ctx.tenantId,
      sponsorTenantId: fund.sponsorTenantId,
      investorId: investor.id,
      fundId: fund.id,
      fundCloseId: nextClose?.id ?? null,
      shareClassId: shareClass?.id ?? null,
      amount: parsed.data.amount,
      status: "draft",
      createdByRepId: ctx.advisorRepId,
    },
  });

  // The fund's engaged fund admin (if any) rides along onto every subscription
  // against that fund, as a participant rather than a column — see
  // SubscriptionParticipant.
  if (fund.fundAdminTenantId) {
    await addSubscriptionParticipant({
      subscriptionId: subscription.id,
      tenantId: fund.fundAdminTenantId,
      role: "fund_admin",
      addedByRepId: ctx.advisorRepId,
    });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "subscription.created",
    entityType: "Subscription",
    entityId: subscription.id,
    metadata: { investorId: investor.id, fundId: fund.id, amount: parsed.data.amount },
  });

  await transitionTo(
    ctx,
    { ...subscription, fundAdminTenantId: fund.fundAdminTenantId, custodianTenantId: null },
    "pending_investor_data"
  );

  res.status(201).json({ id: subscription.id });
});

// ---------------------------------------------------------------------------
// POST /subscriptions/:id/generate-document
// ---------------------------------------------------------------------------
subscriptionsRouter.post("/:id/generate-document", requireAdvisorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const subscription = await ctx.db.subscription.findFirst({
    where: { id: req.params.id },
    include: {
      investor: { include: { taxProfile: true, principals: true } },
      fund: { include: { terms: true } },
      shareClass: true,
      participants: { where: PARTICIPANT_ROLES_FOR_TRANSITIONS },
    },
  });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  const template = await readyTemplateForFund(subscription.fundId);
  if (!template) {
    return res.status(400).json({ error: "This fund has no ready document template" });
  }

  // The one place a raw taxpayer identifier is legitimately needed: filling it
  // onto the document the investor signs. Decrypted here, used immediately,
  // never returned to a client.
  const investorForFill = {
    ...subscription.investor,
    taxProfile: subscription.investor.taxProfile
      ? {
          ...subscription.investor.taxProfile,
          w9TaxpayerId: decryptOptional(subscription.investor.taxProfile.w9TaxpayerId),
          w8ForeignTaxId: decryptOptional(subscription.investor.taxProfile.w8ForeignTaxId),
        }
      : null,
  };

  const resolution = resolveFields(
    template.fieldMappings.map((m) => ({
      anvilFieldKey: m.anvilFieldKey,
      mappingType: m.mappingType,
      canonicalField: m.canonicalField,
      staticValue: m.staticValue,
    })),
    { investor: investorForFill, subscription, fund: subscription.fund, shareClass: subscription.shareClass }
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

  await transitionTo(
    ctx,
    {
      ...subscription,
      fundAdminTenantId: fundAdminTenantIdOf(subscription.participants),
      custodianTenantId: custodianTenantIdOf(subscription.participants),
    },
    "pending_signatures",
    {},
    { documentId: document.id }
  );

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

  const subscription = await ctx.db.subscription.findFirst({
    where: { id: req.params.id },
    include: { participants: { where: PARTICIPANT_ROLES_FOR_TRANSITIONS } },
  });
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

  const signedAt = new Date();
  await ctx.db.signatureRequest.updateMany({
    where: { id: signature.id },
    data: {
      status: "signed",
      signedAt,
      typedName: parsed.data.typedName,
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      ...(signature.role === "gp_countersigner" ? { advisorRepId: ctx.advisorRepId } : {}),
    },
  });

  // Execute every block on the template assigned to this signer's role. A
  // 90-page subscription agreement carries many marks per signer — initials on
  // each questionnaire page, a signature on the execution page, a date beside
  // it — and recording only "signed" would lose which marks are actually
  // present on the document.
  const fulfilled = await fulfillBlocksForSigner({
    db: ctx.db,
    tenantId: ctx.tenantId,
    sponsorTenantId: subscription.sponsorTenantId,
    signatureRequestId: signature.id,
    documentId: signature.documentId,
    role: signature.role,
    typedName: parsed.data.typedName,
    signedAt,
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
      blocksExecuted: fulfilled.length,
      blockKeys: fulfilled.map((f) => f.anvilFieldKey),
    },
  });

  // Auto-advance once a whole side is done.
  const remainingInvestor = await ctx.db.signatureRequest.count({
    where: { subscriptionId: subscription.id, role: "investor_signer", status: "pending" },
  });

  const subscriptionForTransition = {
    ...subscription,
    fundAdminTenantId: fundAdminTenantIdOf(subscription.participants),
    custodianTenantId: custodianTenantIdOf(subscription.participants),
  };
  if (signature.role === "investor_signer" && remainingInvestor === 0) {
    await transitionTo(ctx, subscriptionForTransition, "pending_gp_countersign");
  } else if (signature.role === "gp_countersigner") {
    await transitionTo(ctx, subscriptionForTransition, "pending_fund_admin_review");
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

subscriptionsRouter.post("/:id/transition", requireSponsorOrFundAdmin, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const subscription = await ctx.db.subscription.findFirst({
    where: { id: req.params.id },
    include: { participants: { where: PARTICIPANT_ROLES_FOR_TRANSITIONS } },
  });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }
  if (parsed.data.to === "rejected" && !parsed.data.rejectionReason) {
    return res.status(400).json({ error: "A reason is required when rejecting" });
  }

  const extra =
    parsed.data.to === "rejected" ? { rejectionReason: parsed.data.rejectionReason } : {};
  await transitionTo(
    ctx,
    {
      ...subscription,
      fundAdminTenantId: fundAdminTenantIdOf(subscription.participants),
      custodianTenantId: custodianTenantIdOf(subscription.participants),
    },
    parsed.data.to,
    extra,
    extra
  );

  // Funding is where a position begins. Created here rather than on acceptance
  // because an accepted-but-unfunded subscription is a commitment, not a
  // holding — and the holder register must count holders, not intentions.
  if (parsed.data.to === "funded") {
    await openPositionForSubscription(subscription.id);
  }

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /subscriptions/:id/custodian — advisor attaches a custodian to watch
// funding on this subscription. Once attached, that custodian becomes the
// exclusive party who may confirm funding — see subscriptionStatus.ts.
// ---------------------------------------------------------------------------
const attachCustodianSchema = z.object({ custodianTenantId: z.string().uuid() });

subscriptionsRouter.post("/:id/custodian", requireAdvisorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = attachCustodianSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const subscription = await ctx.db.subscription.findFirst({
    where: { id: req.params.id },
    include: { participants: { where: { role: "custodian" } } },
  });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }
  if (subscription.participants.length > 0) {
    return res.status(400).json({ error: "A custodian is already attached to this subscription" });
  }

  // Tenant is exempt from tenant-scoping (it IS the tenant record), so this
  // read is unfiltered by design — constrained here to type "custodian" so
  // an advisor can't attach an arbitrary tenant into the role.
  const custodianTenant = await ctx.db.tenant.findFirst({
    where: { id: parsed.data.custodianTenantId, type: "custodian" },
  });
  if (!custodianTenant) {
    return res.status(404).json({ error: "Custodian tenant not found" });
  }

  await addSubscriptionParticipant({
    subscriptionId: subscription.id,
    tenantId: custodianTenant.id,
    role: "custodian",
    addedByRepId: ctx.advisorRepId,
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "subscription.custodian_attached",
    entityType: "Subscription",
    entityId: subscription.id,
    metadata: { custodianTenantId: custodianTenant.id, custodianName: custodianTenant.name },
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /subscriptions/:id/confirm-funding — the attached custodian's sole
// action: confirm capital actually landed. Only reachable once a custodian
// is attached and the subscription is accepted; assertTransition enforces
// both (wrong actor -> 403, wrong state -> 400).
// ---------------------------------------------------------------------------
subscriptionsRouter.post("/:id/confirm-funding", requireCustodianTenant, async (req, res) => {
  const ctx = req.ctx!;
  const subscription = await ctx.db.subscription.findFirst({
    where: { id: req.params.id },
    include: { participants: { where: PARTICIPANT_ROLES_FOR_TRANSITIONS } },
  });
  if (!subscription) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  await transitionTo(ctx, {
    ...subscription,
    fundAdminTenantId: fundAdminTenantIdOf(subscription.participants),
    custodianTenantId: custodianTenantIdOf(subscription.participants),
  }, "funded");

  // Same rule as the sponsor/fund-admin funding path: a position begins at
  // funding, not acceptance.
  await openPositionForSubscription(subscription.id);

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
