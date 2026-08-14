import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { DocumentTemplateStatus } from "@prisma/client";
import { FieldMappingType } from "@prisma/client";
import {
  requireAuth,
  requireFundLegalTenant,
  requireSponsorOrFundLegal,
  requireSponsorTenant,
} from "../middleware/requireAuth.js";
import type { RequestContext } from "../types/express.js";
import { audit } from "../audit.js";
import { AnvilClient } from "../anvilClient.js";
import { isCanonicalFieldKey } from "../canonicalFields.js";
import { TransitionError, assertTransition } from "../workflow/templateStatus.js";

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Two routers, because these routes live under two different URL prefixes.
// Previously this was one router mounted at "/", which meant its router-wide
// requireSponsorTenant ran on every request path in the app — harmless while
// every route was sponsor-only, but it silently 403'd the advisor-side
// subscription routes added later. Mount narrowly instead.
export const fundTemplatesRouter = Router({ mergeParams: true });
fundTemplatesRouter.use(requireAuth, requireSponsorTenant);

// templatesRouter itself is no longer sponsor-only: fund counsel reads and
// reviews templates here too, so tenant-type gating moved onto individual
// routes rather than the whole router.
export const templatesRouter = Router();
templatesRouter.use(requireAuth);

// Applies a status transition with its timestamp fields and audit event, the
// same shape as subscriptions.ts's transitionTo — one place so a route can't
// bypass the state machine by setting `status` directly.
async function transitionTemplateTo(
  ctx: RequestContext,
  template: { id: string; status: DocumentTemplateStatus },
  to: DocumentTemplateStatus,
  extraData: Record<string, unknown> = {}
) {
  const rule = assertTransition(template.status, to, ctx.tenantType);

  await ctx.db.documentTemplate.updateMany({
    where: { id: template.id },
    data: { status: to, ...extraData },
  });

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "template.status_changed",
    entityType: "DocumentTemplate",
    entityId: template.id,
    metadata: { from: template.status, to, label: rule.label },
  });

  return rule;
}

// ---------------------------------------------------------------------------
// POST /funds/:fundId/templates — upload PDF, call Anvil, seed unmapped fields
// ---------------------------------------------------------------------------
fundTemplatesRouter.post(
  "/:fundId/templates",
  memoryUpload.single("file"),
  async (req, res) => {
    const ctx = req.ctx!;
    const fund = await ctx.db.fund.findFirst({ where: { id: req.params.fundId } });
    if (!fund) {
      return res.status(404).json({ error: "Fund not found" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Document AI stays off: it is a paid add-on, and a subscription
    // agreement produced by counsel is normally already a fillable form.
    const detected = await AnvilClient.uploadAndDetectFields({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    // A fund with counsel engaged needs that counsel's sign-off before a
    // template can generate documents; a fund with none goes straight to
    // ready on the sponsor's own say — see workflow/templateStatus.ts.
    const initialStatus = fund.fundLegalTenantId ? "processing" : "ready";

    const template = await ctx.db.documentTemplate.create({
      data: {
        sponsorTenantId: ctx.tenantId,
        fundId: fund.id,
        anvilTemplateId: detected.anvilTemplateId,
        originalFilename: req.file.originalname,
        status: initialStatus,
        detectedFieldsRaw: detected.detectedFieldsRaw as any,
        uploadedByRepId: ctx.advisorRepId,
      },
    });

    const fields = detected.fields;
    if (fields.length > 0) {
      await ctx.db.fieldMapping.createMany({
        // anvilFieldKey is the field's id, which is what Anvil's fill payload
        // keys on — confirmed against Cast.exampleData rather than assumed.
        data: fields.map((f) => ({
          sponsorTenantId: ctx.tenantId,
          templateId: template.id,
          anvilFieldKey: f.id,
          anvilFieldLabel: f.name,
        })),
      });
    }

    await audit(ctx.db, ctx.tenantId, {
      actorType: "advisor_rep",
      actorId: ctx.advisorRepId,
      action: "template.uploaded",
      entityType: "DocumentTemplate",
      entityId: template.id,
      metadata: { fundId: fund.id, autoDetectedFieldCount: fields.length },
    });

    res.status(201).json({ ...template, autoDetectedFieldCount: fields.length });
  }
);

// ---------------------------------------------------------------------------
// GET /funds/:fundId/templates
// ---------------------------------------------------------------------------
fundTemplatesRouter.get("/:fundId/templates", async (req, res) => {
  const db = req.ctx!.db;
  const templates = await db.documentTemplate.findMany({
    where: { fundId: req.params.fundId },
    orderBy: { uploadedAt: "desc" },
    include: { fieldMappings: { select: { mappingType: true } } },
  });

  res.json(
    templates.map((t) => ({
      id: t.id,
      originalFilename: t.originalFilename,
      status: t.status,
      uploadedAt: t.uploadedAt,
      totalFieldCount: t.fieldMappings.length,
      unmappedFieldCount: t.fieldMappings.filter((m) => m.mappingType === "unmapped").length,
    }))
  );
});

// ---------------------------------------------------------------------------
// GET /templates/legal-queue — fund_legal: templates awaiting this counsel's
// review, across every fund it's engaged on. Registered before "/:id" so
// Express's param route doesn't swallow this literal path first.
// ---------------------------------------------------------------------------
templatesRouter.get("/legal-queue", requireFundLegalTenant, async (req, res) => {
  const db = req.ctx!.db;
  const templates = await db.documentTemplate.findMany({
    where: { status: "pending_legal_review" },
    orderBy: { uploadedAt: "asc" },
    include: { fund: { select: { id: true, name: true, sponsorTenant: { select: { name: true } } } } },
  });

  res.json(
    templates.map((t) => ({
      id: t.id,
      originalFilename: t.originalFilename,
      uploadedAt: t.uploadedAt,
      fund: { id: t.fund.id, name: t.fund.name, sponsorName: t.fund.sponsorTenant.name },
    }))
  );
});

// ---------------------------------------------------------------------------
// GET /templates/:id — detail + field mappings. Sponsor sees its own
// templates; fund counsel sees templates for funds it's engaged on
// (scopedClient resolves both).
// ---------------------------------------------------------------------------
templatesRouter.get("/:id", requireSponsorOrFundLegal, async (req, res) => {
  const db = req.ctx!.db;
  const template = await db.documentTemplate.findFirst({
    where: { id: req.params.id },
    include: { fieldMappings: { orderBy: { anvilFieldKey: "asc" } } },
  });
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }
  res.json(template);
});

// ---------------------------------------------------------------------------
// POST /templates/:id/submit-for-review — sponsor sends a mapped template to
// its fund's engaged counsel. Blocked while any field is still unmapped: an
// unmapped field is a document counsel hasn't actually been shown filled in.
// ---------------------------------------------------------------------------
templatesRouter.post("/:id/submit-for-review", requireSponsorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const template = await ctx.db.documentTemplate.findFirst({
    where: { id: req.params.id },
    include: { fieldMappings: { select: { mappingType: true } } },
  });
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  const unmappedCount = template.fieldMappings.filter((m) => m.mappingType === "unmapped").length;
  if (unmappedCount > 0) {
    return res.status(400).json({
      error: `${unmappedCount} field(s) are still unmapped. Map every field before submitting for legal review.`,
    });
  }

  await transitionTemplateTo(ctx, template, "pending_legal_review", { legalRejectionReason: null });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /templates/:id/legal-review — fund counsel approves or rejects a
// template it was asked to review.
// ---------------------------------------------------------------------------
const legalReviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    rejectionReason: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "reject" && !data.rejectionReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A reason is required when rejecting" });
    }
  });

templatesRouter.post("/:id/legal-review", requireFundLegalTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = legalReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const template = await ctx.db.documentTemplate.findFirst({ where: { id: req.params.id } });
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  const to = parsed.data.decision === "approve" ? "ready" : "rejected";
  await transitionTemplateTo(ctx, template, to, {
    legalReviewedAt: new Date(),
    legalRejectionReason: parsed.data.decision === "reject" ? parsed.data.rejectionReason : null,
  });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// PATCH /templates/:id/mappings/:mappingId
// ---------------------------------------------------------------------------
const updateMappingSchema = z
  .object({
    mappingType: z.nativeEnum(FieldMappingType),
    canonicalField: z.string().optional(),
    staticValue: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mappingType === "canonical") {
      if (!data.canonicalField || !isCanonicalFieldKey(data.canonicalField)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "canonicalField must be a valid registry key" });
      }
    }
    if (data.mappingType === "static_value" && !data.staticValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "staticValue is required" });
    }
  });

templatesRouter.patch("/:id/mappings/:mappingId", requireSponsorTenant, async (req, res) => {
  const ctx = req.ctx!;
  const parsed = updateMappingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const result = await ctx.db.fieldMapping.updateMany({
    where: { id: req.params.mappingId, templateId: req.params.id },
    data: {
      mappingType: parsed.data.mappingType,
      canonicalField: parsed.data.mappingType === "canonical" ? parsed.data.canonicalField : null,
      staticValue: parsed.data.mappingType === "static_value" ? parsed.data.staticValue : null,
    },
  });
  if (result.count === 0) {
    return res.status(404).json({ error: "Field mapping not found" });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "template.field_mapped",
    entityType: "FieldMapping",
    entityId: req.params.mappingId,
    metadata: { mappingType: parsed.data.mappingType, canonicalField: parsed.data.canonicalField },
  });

  res.status(204).end();
});

// Surface state-machine violations with their own message and status rather
// than a generic 500 from the global error handler — mirrors subscriptions.ts.
templatesRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof TransitionError) {
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
});
