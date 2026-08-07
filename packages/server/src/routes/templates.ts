import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { FieldMappingType } from "@prisma/client";
import { requireAuth, requireSponsorTenant } from "../middleware/requireAuth.js";
import { audit } from "../audit.js";
import { AnvilClient } from "../anvilClient.js";
import { isCanonicalFieldKey } from "../canonicalFields.js";

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

export const templatesRouter = Router();
templatesRouter.use(requireAuth, requireSponsorTenant);

// Best-effort extraction of {key, label} pairs from Anvil's `fieldInfo`.
// The exact shape isn't confirmed (see anvilClient.ts) — this tries the
// couple of shapes that would be reasonable for a GraphQL field named
// `fieldInfo` returning "detected field information", and falls back to an
// empty list (raw JSON still gets stored either way) rather than guessing
// wrong and silently creating garbage FieldMapping rows.
function extractDetectedFields(raw: unknown): { key: string; label?: string }[] {
  const candidates = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as any).fields)
      ? (raw as any).fields
      : null;

  if (!candidates) return [];

  return candidates
    .filter((f: unknown) => f && typeof f === "object" && "id" in (f as object))
    .map((f: any) => ({ key: String(f.id), label: f.name ? String(f.name) : undefined }));
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

    const detected = await AnvilClient.uploadAndDetectFields({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    const template = await ctx.db.documentTemplate.create({
      data: {
        sponsorTenantId: ctx.tenantId,
        fundId: fund.id,
        anvilTemplateId: detected.anvilTemplateId,
        originalFilename: req.file.originalname,
        status: "ready",
        detectedFieldsRaw: detected.detectedFieldsRaw as any,
        uploadedByRepId: ctx.advisorRepId,
      },
    });

    const fields = extractDetectedFields(detected.detectedFieldsRaw);
    if (fields.length > 0) {
      await ctx.db.fieldMapping.createMany({
        data: fields.map((f) => ({
          sponsorTenantId: ctx.tenantId,
          templateId: template.id,
          anvilFieldKey: f.key,
          anvilFieldLabel: f.label,
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
// GET /templates/:id — detail + field mappings
// ---------------------------------------------------------------------------
templatesRouter.get("/:id", async (req, res) => {
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

templatesRouter.patch("/:id/mappings/:mappingId", async (req, res) => {
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
