import { Router } from "express";
import { z } from "zod";
import {
  AccreditationBasis,
  InvestorType,
  PrincipalRole,
  TaxFormType,
} from "@prisma/client";
import { requireAuth } from "../middleware/requireAuth.js";
import { audit } from "../audit.js";
import { upload } from "../upload.js";

export const investorsRouter = Router();
investorsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /investors — dashboard list with subscription count/status summary
// ---------------------------------------------------------------------------
investorsRouter.get("/", async (req, res) => {
  const db = req.ctx!.db;
  const investors = await db.investor.findMany({
    orderBy: { createdAt: "desc" },
    include: { subscriptions: { select: { status: true } } },
  });

  const results = investors.map((investor) => {
    const statusCounts: Record<string, number> = {};
    for (const sub of investor.subscriptions) {
      statusCounts[sub.status] = (statusCounts[sub.status] ?? 0) + 1;
    }
    return {
      id: investor.id,
      type: investor.type,
      displayName:
        investor.type === "individual" || investor.type === "joint"
          ? `${investor.firstName ?? ""} ${investor.lastName ?? ""}`.trim()
          : investor.entityName ?? "(unnamed)",
      accreditationBasis: investor.accreditationBasis,
      createdAt: investor.createdAt,
      subscriptionCount: investor.subscriptions.length,
      subscriptionStatusCounts: statusCounts,
    };
  });

  res.json(results);
});

// ---------------------------------------------------------------------------
// GET /investors/:id — profile + subscription history
// ---------------------------------------------------------------------------
investorsRouter.get("/:id", async (req, res) => {
  const db = req.ctx!.db;
  const investor = await db.investor.findFirst({
    where: { id: req.params.id },
    include: {
      principals: true,
      taxProfile: true,
      evidence: true,
      subscriptions: { include: { fund: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!investor) {
    return res.status(404).json({ error: "Investor not found" });
  }
  res.json(investor);
});

// ---------------------------------------------------------------------------
// POST /investors — wizard step 1: personal/entity info
// ---------------------------------------------------------------------------
const principalSchema = z.object({
  role: z.nativeEnum(PrincipalRole),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  title: z.string().optional(),
  isPrimaryContact: z.boolean().optional(),
});

const createInvestorSchema = z.object({
  type: z.nativeEnum(InvestorType),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  ssnLast4: z.string().length(4).optional(),
  entityName: z.string().optional(),
  entitySubtype: z.string().optional(),
  formationJurisdiction: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  principals: z.array(principalSchema).min(1),
});

investorsRouter.post("/", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = createInvestorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { principals, dateOfBirth, ...rest } = parsed.data;

  const investor = await ctx.db.investor.create({
    data: {
      tenantId: ctx.tenantId,
      ...rest,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      createdByRepId: ctx.advisorRepId,
    },
  });

  await ctx.db.investorPrincipal.createMany({
    data: principals.map((p) => ({ ...p, tenantId: ctx.tenantId, investorId: investor.id })),
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "investor.created",
    entityType: "Investor",
    entityId: investor.id,
    metadata: { type: investor.type },
  });

  res.status(201).json(investor);
});

// ---------------------------------------------------------------------------
// PATCH /investors/:id — edit core profile fields
// ---------------------------------------------------------------------------
const updateInvestorSchema = createInvestorSchema
  .omit({ principals: true })
  .partial();

investorsRouter.patch("/:id", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = updateInvestorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { dateOfBirth, ...rest } = parsed.data;

  const result = await ctx.db.investor.updateMany({
    where: { id: req.params.id },
    data: { ...rest, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined },
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Investor not found" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "investor.updated",
    entityType: "Investor",
    entityId: req.params.id,
    metadata: { fields: Object.keys(rest) },
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// PATCH /investors/:id/accreditation — wizard step 2
// ---------------------------------------------------------------------------
const accreditationSchema = z.object({
  accreditationBasis: z.nativeEnum(AccreditationBasis),
  accreditationDetails: z.record(z.unknown()).optional(),
});

investorsRouter.patch("/:id/accreditation", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = accreditationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await ctx.db.investor.updateMany({
    where: { id: req.params.id },
    data: {
      accreditationBasis: parsed.data.accreditationBasis,
      accreditationDetails: parsed.data.accreditationDetails,
      accreditationAttestedAt: new Date(),
    },
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Investor not found" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "investor.accreditation_set",
    entityType: "Investor",
    entityId: req.params.id,
    metadata: { basis: parsed.data.accreditationBasis },
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /investors/:id/evidence — accreditation evidence upload (local disk stub)
// ---------------------------------------------------------------------------
investorsRouter.post("/:id/evidence", upload.single("file"), async (req, res) => {
  const ctx = req.ctx!;
  const investor = await ctx.db.investor.findFirst({ where: { id: req.params.id } });
  if (!investor) {
    return res.status(404).json({ error: "Investor not found" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const evidence = await ctx.db.accreditationEvidence.create({
    data: {
      tenantId: ctx.tenantId,
      investorId: investor.id,
      fileName: req.file.originalname,
      storagePath: req.file.path,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedByRepId: ctx.advisorRepId,
    },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "investor.evidence_uploaded",
    entityType: "Investor",
    entityId: investor.id,
    metadata: { evidenceId: evidence.id, fileName: evidence.fileName },
  });

  res.status(201).json(evidence);
});

// ---------------------------------------------------------------------------
// PATCH /investors/:id/tax-profile — wizard step 3 (W-9 / W-8BEN branch)
// ---------------------------------------------------------------------------
const taxProfileSchema = z.object({
  formType: z.nativeEnum(TaxFormType),
  w9TaxpayerIdType: z.string().optional(),
  w9TaxpayerId: z.string().optional(),
  w9ExemptPayeeCode: z.string().optional(),
  w9BackupWithholding: z.boolean().optional(),
  w8CountryOfCitizenship: z.string().optional(),
  w8ForeignTaxId: z.string().optional(),
  w8TreatyCountry: z.string().optional(),
  w8PermanentResidenceAddr: z.string().optional(),
});

investorsRouter.patch("/:id/tax-profile", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = taxProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const investor = await ctx.db.investor.findFirst({ where: { id: req.params.id } });
  if (!investor) {
    return res.status(404).json({ error: "Investor not found" });
  }

  const existing = await ctx.db.investorTaxProfile.findFirst({
    where: { investorId: investor.id },
  });

  const data = { ...parsed.data, certifiedAt: new Date() };
  if (existing) {
    await ctx.db.investorTaxProfile.updateMany({
      where: { investorId: investor.id },
      data,
    });
  } else {
    await ctx.db.investorTaxProfile.create({
      data: { ...data, tenantId: ctx.tenantId, investorId: investor.id },
    });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "investor.tax_profile_set",
    entityType: "Investor",
    entityId: investor.id,
    metadata: { formType: parsed.data.formType },
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /investors/:id/submit — wizard step 4: review/submit
// ---------------------------------------------------------------------------
investorsRouter.post("/:id/submit", async (req, res) => {
  const ctx = req.ctx!;
  const investor = await ctx.db.investor.findFirst({
    where: { id: req.params.id },
    include: { taxProfile: true },
  });
  if (!investor) {
    return res.status(404).json({ error: "Investor not found" });
  }
  if (!investor.accreditationBasis) {
    return res.status(400).json({ error: "Accreditation basis is required before submitting" });
  }
  if (!investor.taxProfile) {
    return res.status(400).json({ error: "Tax profile is required before submitting" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "investor.onboarding_submitted",
    entityType: "Investor",
    entityId: investor.id,
  });

  res.status(204).end();
});
