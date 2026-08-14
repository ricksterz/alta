import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSponsorTenant } from "../middleware/requireAuth.js";
import { audit } from "../audit.js";
import { prisma } from "../db/client.js";
import { holderCapacity } from "../workflow/holderRegister.js";
import { checkTransferCompliance } from "../workflow/transferCompliance.js";

export const positionsRouter = Router();
positionsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /positions — the caller's slice of the register
// ---------------------------------------------------------------------------
positionsRouter.get("/", async (req, res) => {
  const ctx = req.ctx!;
  const positions = await ctx.db.position.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      investor: { select: { id: true, type: true, firstName: true, lastName: true, entityName: true } },
      fund: { select: { id: true, name: true, exclusion: true } },
    },
  });

  res.json(
    positions.map((p) => ({
      id: p.id,
      investor: {
        id: p.investor.id,
        displayName:
          p.investor.type === "entity" || p.investor.type === "trust"
            ? (p.investor.entityName ?? "(unnamed)")
            : `${p.investor.firstName ?? ""} ${p.investor.lastName ?? ""}`.trim(),
      },
      fund: p.fund,
      commitmentAmount: p.commitmentAmount,
      fundedAmount: p.fundedAmount,
      status: p.status,
      tokenization: p.tokenization,
      chain: p.chain,
      tokenStandard: p.tokenStandard,
      contractAddress: p.contractAddress,
      tokenId: p.tokenId,
      holderWalletAddress: p.holderWalletAddress,
      createdAt: p.createdAt,
    }))
  );
});

// ---------------------------------------------------------------------------
// GET /positions/holder-capacity/:fundId — register-backed 3(c)(1) headroom
// ---------------------------------------------------------------------------
positionsRouter.get("/holder-capacity/:fundId", async (req, res) => {
  res.json(await holderCapacity(req.params.fundId));
});

// ---------------------------------------------------------------------------
// PATCH /positions/:id/tokenization — record on-chain representation
// ---------------------------------------------------------------------------
// Record-keeping only: this states where an interest is represented on chain.
// Alta does not custody keys, sign, or broadcast — the issuer or its transfer
// agent mints, then records the result here so the register and the token
// agree on who holds what.
const tokenizationSchema = z.object({
  tokenization: z.enum(["none", "pending", "minted", "frozen"]),
  chain: z.string().optional(),
  tokenStandard: z.string().optional(),
  contractAddress: z.string().optional(),
  tokenId: z.string().optional(),
  holderWalletAddress: z.string().optional(),
});

positionsRouter.patch("/:id/tokenization", requireSponsorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = tokenizationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await ctx.db.position.updateMany({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      mintedAt: parsed.data.tokenization === "minted" ? new Date() : undefined,
    },
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Position not found" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "position.tokenization_updated",
    entityType: "Position",
    entityId: req.params.id,
    metadata: parsed.data,
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /compliance/can-transfer — the oracle
// ---------------------------------------------------------------------------
// Shaped as a single allow/deny with reason codes because that is what a
// compliance contract in an ERC-3643 transfer path needs. Read-only and
// idempotent: asking does not reserve capacity or create a request.
const canTransferSchema = z.object({
  positionId: z.string().uuid(),
  toInvestorId: z.string().uuid(),
});

positionsRouter.post("/can-transfer", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = canTransferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const position = await ctx.db.position.findFirst({
    where: { id: parsed.data.positionId },
    include: { fund: true },
  });
  if (!position) return res.status(404).json({ error: "Position not found" });

  const transferee = await ctx.db.investor.findFirst({
    where: { id: parsed.data.toInvestorId },
  });
  if (!transferee) return res.status(404).json({ error: "Transferee not found" });

  const existingHolding = await prisma.position.findFirst({
    where: {
      fundId: position.fundId,
      investorId: transferee.id,
      status: { in: ["active", "partially_transferred"] },
    },
    select: { id: true },
  });

  res.json(
    await checkTransferCompliance(
      {
        transferee: {
          type: transferee.type,
          accreditationBasis: transferee.accreditationBasis,
          qualifiedPurchaserBasis: transferee.qualifiedPurchaserBasis,
        },
        fund: {
          id: position.fundId,
          name: position.fund.name,
          exclusion: position.fund.exclusion,
        },
        transfereeIsExistingHolder: Boolean(existingHolding),
      },
      new Date()
    )
  );
});

// ---------------------------------------------------------------------------
// POST /positions/:id/transfers — request a secondary transfer
// ---------------------------------------------------------------------------
const transferSchema = z.object({
  toInvestorId: z.string().uuid(),
  amount: z.number().positive(),
});

positionsRouter.post("/:id/transfers", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const position = await ctx.db.position.findFirst({
    where: { id: req.params.id },
    include: { fund: true },
  });
  if (!position) return res.status(404).json({ error: "Position not found" });
  if (Number(position.commitmentAmount) < parsed.data.amount) {
    return res.status(400).json({ error: "Transfer exceeds the position's size" });
  }

  const transferee = await ctx.db.investor.findFirst({
    where: { id: parsed.data.toInvestorId },
  });
  if (!transferee) return res.status(404).json({ error: "Transferee not found" });

  const existingHolding = await prisma.position.findFirst({
    where: {
      fundId: position.fundId,
      investorId: transferee.id,
      status: { in: ["active", "partially_transferred"] },
    },
    select: { id: true },
  });

  const compliance = await checkTransferCompliance(
    {
      transferee: {
        type: transferee.type,
        accreditationBasis: transferee.accreditationBasis,
        qualifiedPurchaserBasis: transferee.qualifiedPurchaserBasis,
      },
      fund: {
        id: position.fundId,
        name: position.fund.name,
        exclusion: position.fund.exclusion,
        transferrable: position.fund.transferrable,
      },
      transfereeIsExistingHolder: Boolean(existingHolding),
    },
    new Date()
  );

  // A failed compliance check rejects immediately. A passing one either
  // needs GP consent (the default, required by nearly every LPA) or, for a
  // fund that explicitly waives it, is approved outright — the same
  // exclusivity principle as effectiveActor elsewhere: the fund's own terms
  // decide who acts next, not a hardcoded assumption.
  const status = !compliance.allowed
    ? "rejected"
    : position.fund.gpConsentRequired
      ? "pending_gp_consent"
      : "approved";

  const transfer = await ctx.db.transferRequest.create({
    data: {
      tenantId: ctx.tenantId,
      sponsorTenantId: position.sponsorTenantId,
      requestedByTenantId: ctx.tenantId,
      positionId: position.id,
      toInvestorId: transferee.id,
      amount: parsed.data.amount,
      status,
      eligibilitySnapshot: compliance as unknown as object,
      rejectionReason: compliance.allowed
        ? null
        : compliance.reasons.map((r) => r.message).join(" "),
      decidedAt: status === "pending_gp_consent" ? null : new Date(),
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: compliance.allowed ? "transfer.requested" : "transfer.blocked_ineligible",
    entityType: "TransferRequest",
    entityId: transfer.id,
    metadata: {
      positionId: position.id,
      toInvestorId: transferee.id,
      allowed: compliance.allowed,
      reasons: compliance.reasons.map((r) => r.code),
    },
  });

  res.status(compliance.allowed ? 201 : 403).json({
    id: transfer.id,
    status: transfer.status,
    compliance,
  });
});

// ---------------------------------------------------------------------------
// POST /positions/transfers/:transferId/consent — GP consent
// ---------------------------------------------------------------------------
const consentSchema = z.object({
  approve: z.boolean(),
  reason: z.string().optional(),
});

positionsRouter.post(
  "/transfers/:transferId/consent",
  requireSponsorTenant,
  async (req, res) => {
    const ctx = req.ctx!;
    const parsed = consentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const transfer = await ctx.db.transferRequest.findFirst({
      where: { id: req.params.transferId },
    });
    if (!transfer) return res.status(404).json({ error: "Transfer request not found" });
    if (transfer.status !== "pending_gp_consent") {
      return res.status(400).json({ error: `Transfer is ${transfer.status}, not awaiting consent` });
    }

    await ctx.db.transferRequest.updateMany({
      where: { id: transfer.id },
      data: {
        status: parsed.data.approve ? "approved" : "rejected",
        rejectionReason: parsed.data.approve ? null : (parsed.data.reason ?? "GP consent withheld"),
        decidedAt: new Date(),
      },
    });

    await audit(ctx.db, ctx.tenantId, {
      actorType: "advisor_rep",
      actorId: ctx.advisorRepId,
      action: parsed.data.approve ? "transfer.consented" : "transfer.consent_withheld",
      entityType: "TransferRequest",
      entityId: transfer.id,
      metadata: { positionId: transfer.positionId },
    });

    res.status(204).end();
  }
);
