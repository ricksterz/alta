import type { TenantType } from "@prisma/client";
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
// Three ownership shapes, resolved per model by tenantColumnFor():
//
//  1. Advisor-owned (the default): scoped by `tenantId`. Investor, Session,
//     AuditEvent, etc.
//  2. Sponsor-owned: scoped by `sponsorTenantId`. Fund, DocumentTemplate,
//     FieldMapping, FundAdvisorEntitlement. A deliberately different column
//     name so code can't accidentally apply an advisor tenant's filter to
//     sponsor-owned data or vice versa.
//  3. Multi-owned: carries SEVERAL owning columns, and which one applies
//     depends on who is asking. A Subscription belongs to the advisor tenant
//     that created it, the sponsor tenant whose fund it subscribes to, and —
//     when one is engaged — the fund administrator reviewing it. All three
//     must see it; none may see the others' unrelated subscriptions. This is
//     the shape that needs the caller's tenant TYPE, not just their id, which
//     is why scopedClient takes both.
//
// The multi-owned case is the one worth being careful about: getting it wrong
// in the permissive direction leaks one advisor firm's book of business to
// another, so the mapping below is explicit per model rather than inferred
// from which columns happen to exist.
//
// Note the fund_admin asymmetry. Subscription.fundAdminTenantId is NULLABLE —
// most funds have no admin on-platform — so a fund_admin caller filtering on
// it correctly sees only the subscriptions actually routed to them. Models
// with no fund-admin column at all (Position, TransferRequest) are simply not
// visible to fund_admin tenants, which is the intended behaviour: an
// administrator reviews subscriptions, it does not hold the register.

const TENANT_EXEMPT_MODELS = new Set(["Tenant"]);

const SPONSOR_OWNED_MODELS = new Set([
  "Fund",
  "FundAdvisorEntitlement",
  "DocumentTemplate",
  "FieldMapping",
  "SignatureBlock",
  "FundClose",
]);

// Per-model column to filter on, by caller tenant type. A model absent from a
// given tenant type's mapping is invisible to that tenant type.
const MULTI_OWNED_MODELS: Record<string, Partial<Record<TenantType, string>>> = {
  Subscription: {
    advisor_firm: "tenantId",
    sponsor_firm: "sponsorTenantId",
    fund_admin: "fundAdminTenantId",
  },
  SubscriptionDocument: {
    advisor_firm: "tenantId",
    sponsor_firm: "sponsorTenantId",
  },
  SignatureRequest: {
    advisor_firm: "tenantId",
    sponsor_firm: "sponsorTenantId",
  },
  SignatureBlockFulfillment: {
    advisor_firm: "tenantId",
    sponsor_firm: "sponsorTenantId",
  },
  Position: {
    advisor_firm: "tenantId",
    sponsor_firm: "sponsorTenantId",
  },
  TransferRequest: {
    advisor_firm: "tenantId",
    sponsor_firm: "sponsorTenantId",
  },
};

/** Thrown when a tenant type queries a model it has no ownership column on. */
export class ModelNotVisibleError extends Error {}

function tenantColumnFor(model: string, tenantType: TenantType): string {
  const multi = MULTI_OWNED_MODELS[model];
  if (multi) {
    const column = multi[tenantType];
    if (!column) {
      throw new ModelNotVisibleError(
        `${model} is not visible to a ${tenantType} tenant: it has no ownership ` +
          `column for that tenant type. This is a deliberate boundary, not a bug — ` +
          `if this access is intended, add the column and map it here.`
      );
    }
    return column;
  }
  if (SPONSOR_OWNED_MODELS.has(model)) {
    return "sponsorTenantId";
  }
  return "tenantId";
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

export function scopedClient(tenantId: string, tenantType: TenantType) {
  return prisma.$extends({
    name: `tenant-scope`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (TENANT_EXEMPT_MODELS.has(model)) {
            return query(args);
          }
          const column = tenantColumnFor(model, tenantType);

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
