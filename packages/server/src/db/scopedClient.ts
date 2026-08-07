import { prisma } from "./client.js";

// Tenant-isolation enforcement lives here, in one place, rather than in
// every route handler. requireAuth (see ../middleware/requireAuth.ts) binds
// one of these to req.ctx.db per request; nothing downstream ever sees the
// raw client.
//
// Strategy:
//  - Every read/bulk-write operation gets the model's tenant-owning column
//    merged into its `where` automatically.
//  - `create`/`createMany` get that column merged into `data` automatically.
//  - Operations whose `where` must be a bare unique selector (findUnique,
//    update, delete, upsert) are disabled outright — Prisma won't let us
//    add a non-unique filter to those, so allowing them through unscoped
//    would be a silent cross-tenant read/write hole. Use the *Many
//    equivalent with an explicit { id, <tenantColumn> } filter instead.
//  - Tenant itself is exempt (it has no tenant-owning column — it IS the
//    tenant).
//
// One caller-supplied id, two possible meanings: most models are owned by
// an advisor tenant via `tenantId`. Fund/DocumentTemplate/FieldMapping/
// FundAdvisorEntitlement (Phase 2) are owned by a sponsor tenant instead —
// deliberately via a differently-named column, `sponsorTenantId`, so code
// can't accidentally apply an advisor tenant's filter to sponsor-owned data
// or vice versa. scopedClient(id) doesn't need to know which kind of tenant
// `id` is — a session only ever holds one, and the column-override map below
// routes each model to the right one.

const TENANT_EXEMPT_MODELS = new Set(["Tenant"]);

const TENANT_COLUMN_OVERRIDES: Record<string, string> = {
  Fund: "sponsorTenantId",
  FundAdvisorEntitlement: "sponsorTenantId",
  DocumentTemplate: "sponsorTenantId",
  FieldMapping: "sponsorTenantId",
};

function tenantColumnFor(model: string): string {
  return TENANT_COLUMN_OVERRIDES[model] ?? "tenantId";
}

const BANNED_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
  "upsert",
]);

const WHERE_SCOPED_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

const DATA_SCOPED_CREATE_OPERATIONS = new Set(["create"]);
const DATA_SCOPED_CREATE_MANY_OPERATIONS = new Set([
  "createMany",
  "createManyAndReturn",
]);

export function scopedClient(tenantId: string) {
  return prisma.$extends({
    name: `tenant-scope`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (TENANT_EXEMPT_MODELS.has(model)) {
            return query(args);
          }
          const column = tenantColumnFor(model);

          if (BANNED_OPERATIONS.has(operation)) {
            throw new Error(
              `${model}.${operation} is disabled on the tenant-scoped client: its ` +
                `\`where\` must be a bare unique selector, which can't be safely ` +
                `constrained to a tenant. Use the *Many equivalent with an explicit ` +
                `{ id, ${column} } filter, or findFirst, instead.`
            );
          }

          if (WHERE_SCOPED_OPERATIONS.has(operation)) {
            const scoped = args as { where?: Record<string, unknown> };
            scoped.where = { ...scoped.where, [column]: tenantId };
            return query(scoped);
          }

          if (DATA_SCOPED_CREATE_OPERATIONS.has(operation)) {
            const scoped = args as { data: Record<string, unknown> };
            scoped.data = { ...scoped.data, [column]: tenantId };
            return query(scoped);
          }

          if (DATA_SCOPED_CREATE_MANY_OPERATIONS.has(operation)) {
            const scoped = args as {
              data: Record<string, unknown> | Record<string, unknown>[];
            };
            scoped.data = Array.isArray(scoped.data)
              ? scoped.data.map((row) => ({ ...row, [column]: tenantId }))
              : { ...scoped.data, [column]: tenantId };
            return query(scoped);
          }

          return query(args);
        },
      },
    },
  });
}

export type ScopedClient = ReturnType<typeof scopedClient>;
