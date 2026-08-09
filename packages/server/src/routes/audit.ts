import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";

export const auditRouter = Router();
auditRouter.use(requireAuth);

// The payoff for routing every write through one audit() function since Phase
// 1: a single, consistently-shaped event stream, queryable without stitching
// together per-feature logs.
//
// Tenant scoping applies here like anywhere else — AuditEvent carries tenantId
// and the scoped client filters it. A firm sees its own history and no one
// else's. Note the consequence for a multi-owned record: a subscription's
// events are split across the tenants that acted on it, because each event was
// written by whoever performed it. That is the correct record of who did what;
// it is not a single unified timeline visible to all parties, and presenting it
// as one would misrepresent whose action it was.

const querySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

auditRouter.get("/", async (req, res) => {
  const ctx = req.ctx!;
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const q = parsed.data;

  const where: Record<string, unknown> = {};
  if (q.action) where.action = q.action;
  if (q.entityType) where.entityType = q.entityType;
  if (q.entityId) where.entityId = q.entityId;
  if (q.actorId) where.actorId = q.actorId;
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(q.to) } : {}),
    };
  }
  if (q.search) {
    where.OR = [
      { action: { contains: q.search, mode: "insensitive" } },
      { entityType: { contains: q.search, mode: "insensitive" } },
      { entityId: { contains: q.search, mode: "insensitive" } },
    ];
  }

  // Keyset pagination on createdAt. An audit log only grows, and offset
  // pagination over a growing table silently skips or repeats rows as new
  // events arrive mid-scroll — not acceptable for a record someone is
  // reconciling against.
  const events = await ctx.db.auditEvent.findMany({
    where: q.cursor ? { ...where, createdAt: { ...(where.createdAt as object), lt: new Date(q.cursor) } } : where,
    orderBy: { createdAt: "desc" },
    take: q.limit + 1,
  });

  const hasMore = events.length > q.limit;
  const page = hasMore ? events.slice(0, q.limit) : events;

  // Actor names, resolved in one query rather than per row.
  const actorIds = [...new Set(page.map((e) => e.actorId).filter((x): x is string => Boolean(x)))];
  const actors = actorIds.length
    ? await ctx.db.advisorRep.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  res.json({
    events: page.map((e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      actorType: e.actorType,
      actor: e.actorId ? (actorById.get(e.actorId) ?? null) : null,
      metadata: e.metadata,
      createdAt: e.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
  });
});

// ---------------------------------------------------------------------------
// GET /audit/facets — the distinct values available to filter on
// ---------------------------------------------------------------------------
// Served rather than hardcoded in the frontend: action strings are added by
// whoever adds a feature, and a filter list that drifts from what is actually
// recorded is worse than no filter list.
auditRouter.get("/facets", async (req, res) => {
  const ctx = req.ctx!;
  const [actions, entityTypes] = await Promise.all([
    ctx.db.auditEvent.groupBy({ by: ["action"], _count: { action: true } }),
    ctx.db.auditEvent.groupBy({ by: ["entityType"], _count: { entityType: true } }),
  ]);

  res.json({
    actions: actions
      .map((a) => ({ value: a.action, count: a._count.action }))
      .sort((x, y) => y.count - x.count),
    entityTypes: entityTypes
      .map((e) => ({ value: e.entityType, count: e._count.entityType }))
      .sort((x, y) => y.count - x.count),
  });
});

// ---------------------------------------------------------------------------
// GET /audit/entity/:entityType/:entityId — one record's full history
// ---------------------------------------------------------------------------
auditRouter.get("/entity/:entityType/:entityId", async (req, res) => {
  const ctx = req.ctx!;
  const events = await ctx.db.auditEvent.findMany({
    where: { entityType: req.params.entityType, entityId: req.params.entityId },
    orderBy: { createdAt: "asc" },
  });
  res.json(events);
});
