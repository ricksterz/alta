import type { TenantType } from "@prisma/client";
import { prisma } from "./client.js";

// Tenant-isolation enforcement lives here, in one place, rather than in
// every route handler. requireAuth (see ../middleware/requireAuth.ts) binds
// one of these to req.ctx.db per request; nothing downstream ever sees the
// raw client.
//
// Strategy:
//  - Every read/bulk-write operation gets the model's tenant-owning column
//    (or, for a participant-scoped model, a relation filter — see below)
//    merged into its `where` automatically.
//  - `create`/`createMany` get that column merged into `data` automatically.
//    Participant mode has no create counterpart — nothing in this codebase
//    creates a Subscription as a fund_admin or custodian, and the extension
//    throws rather than silently doing nothing if that ever changes.
//  - Operations whose `where` must be a bare unique selector (findUnique,
//    update, delete, upsert) are disabled outright — Prisma won't let us
//    add a non-unique filter to those, so allowing them through unscoped
//    would be a silent cross-tenant read/write hole. Use the *Many
//    equivalent with an explicit { id, <tenantColumn> } filter instead.
//  - Tenant itself is exempt (it has no tenant-owning column — it IS the
//    tenant).
//
// Five ownership shapes, resolved per (model, tenantType) by scopeFor():
//
//  1. Advisor-owned (the default): scoped by `tenantId`. Investor, Session,
//     AuditEvent, etc.
//  2. Sponsor-owned: scoped by `sponsorTenantId`. Fund, FieldMapping,
//     FundAdvisorEntitlement. A deliberately different column name so code
//     can't accidentally apply an advisor tenant's filter to sponsor-owned
//     data or vice versa.
//  3. Multi-owned by fixed column: a small, FIXED set of parties, each with
//     its own column. Subscription's advisor (tenantId) and sponsor
//     (sponsorTenantId) are the only two parties present on every
//     subscription, which is what makes a column defensible for them.
//  4. Participant-scoped: a VARIABLE, optional set of parties — fund admin,
//     custodian, whoever gets added next — tracked in
//     SubscriptionParticipant rather than as more nullable columns. Visibility
//     resolves to "does a participant row exist for me", a relation filter
//     (`participants: { some: { tenantId, role } } }`) rather than a flat
//     column comparison. This is the shape that replaced a growing pile of
//     nullable *TenantId columns once a second optional party (custodian)
//     showed up alongside the first (fund admin) — see the schema comment on
//     SubscriptionParticipant for the full reasoning.
//  5. Owned via a parent's column: the model itself carries no tenant column
//     for this party, but its parent does, and the relation is to-one so no
//     `some` wrapper is needed. DocumentTemplate has no fundLegalTenantId of
//     its own — Fund does — so fund_legal's visibility is
//     `{ fund: { fundLegalTenantId } }`. Unlike participant mode this is a
//     FIXED single party (a fund has at most one law firm engaged here), it
//     just happens to live one hop away.
//
// Getting any of this wrong in the permissive direction leaks one tenant's
// data to another, so the mapping below is explicit per (model, tenantType)
// rather than inferred from which columns or relations happen to exist.

const TENANT_EXEMPT_MODELS = new Set(["Tenant"]);

const SPONSOR_OWNED_MODELS = new Set([
  "Fund",
  "FundAdvisorEntitlement",
  "FieldMapping",
  "SignatureBlock",
  "FundClose",
  "FundTerms",
  "ShareClass",
]);

type Scope =
  | { kind: "column"; column: string }
  | { kind: "participant"; relation: string; role: TenantType }
  | { kind: "toOneRelation"; relation: string; column: string };

// Per-model column (or participant relation) to filter on, by caller tenant
// type. A model/tenantType combination absent here is invisible to that
// tenant type — see ModelNotVisibleError below.
// A direct investor is the advisor-side party on its own subscriptions —
// same tenantId column, same shape as an advisor_firm — so it takes an
// identical scope everywhere advisor_firm appears below.
const MULTI_OWNED_MODELS: Record<string, Partial<Record<TenantType, Scope>>> = {
  Subscription: {
    advisor_firm: { kind: "column", column: "tenantId" },
    investor_direct: { kind: "column", column: "tenantId" },
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
    fund_admin: { kind: "participant", relation: "participants", role: "fund_admin" },
    custodian: { kind: "participant", relation: "participants", role: "custodian" },
  },
  DocumentTemplate: {
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
    fund_legal: { kind: "toOneRelation", relation: "fund", column: "fundLegalTenantId" },
  },
  SubscriptionDocument: {
    advisor_firm: { kind: "column", column: "tenantId" },
    investor_direct: { kind: "column", column: "tenantId" },
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
  },
  SignatureRequest: {
    advisor_firm: { kind: "column", column: "tenantId" },
    investor_direct: { kind: "column", column: "tenantId" },
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
  },
  SignatureBlockFulfillment: {
    advisor_firm: { kind: "column", column: "tenantId" },
    investor_direct: { kind: "column", column: "tenantId" },
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
  },
  Position: {
    advisor_firm: { kind: "column", column: "tenantId" },
    investor_direct: { kind: "column", column: "tenantId" },
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
  },
  TransferRequest: {
    advisor_firm: { kind: "column", column: "tenantId" },
    investor_direct: { kind: "column", column: "tenantId" },
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
  },
  CapitalCallAllocation: {
    advisor_firm: { kind: "column", column: "tenantId" },
    investor_direct: { kind: "column", column: "tenantId" },
    sponsor_firm: { kind: "column", column: "sponsorTenantId" },
  },
};

/** Thrown when a tenant type queries a model it has no ownership scope for. */
export class ModelNotVisibleError extends Error {}

function scopeFor(model: string, tenantType: TenantType): Scope {
  const multi = MULTI_OWNED_MODELS[model];
  if (multi) {
    const scope = multi[tenantType];
    if (!scope) {
      throw new ModelNotVisibleError(
        `${model} is not visible to a ${tenantType} tenant: it has no ownership ` +
          `scope for that tenant type. This is a deliberate boundary, not a bug — ` +
          `if this access is intended, add it to MULTI_OWNED_MODELS.`
      );
    }
    return scope;
  }
  if (SPONSOR_OWNED_MODELS.has(model)) {
    return { kind: "column", column: "sponsorTenantId" };
  }
  return { kind: "column", column: "tenantId" };
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
          const scope = scopeFor(model, tenantType);
          const label =
            scope.kind === "column"
              ? scope.column
              : `${scope.relation}.${scope.kind === "participant" ? "tenantId" : scope.column}`;

          if (BANNED_OPERATIONS.has(operation)) {
            throw new Error(
              `${model}.${operation} is disabled on the tenant-scoped client: its ` +
                `\`where\` must be a bare unique selector, which can't be safely ` +
                `constrained to a tenant. Use the *Many equivalent with an explicit ` +
                `{ id, ${label} } filter, or findFirst, instead.`
            );
          }

          if (WHERE_SCOPED_OPERATIONS.has(operation)) {
            const scoped = args as { where?: Record<string, unknown> };
            scoped.where = {
              ...scoped.where,
              ...(scope.kind === "column"
                ? { [scope.column]: tenantId }
                : scope.kind === "participant"
                  ? { [scope.relation]: { some: { tenantId, role: scope.role } } }
                  : { [scope.relation]: { [scope.column]: tenantId } }),
            };
            return query(scoped);
          }

          if (
            DATA_SCOPED_CREATE_OPERATIONS.has(operation) ||
            DATA_SCOPED_CREATE_MANY_OPERATIONS.has(operation)
          ) {
            if (scope.kind !== "column") {
              throw new Error(
                `${model}.${operation} is not supported for a ${scope.kind}-scoped ` +
                  `tenant type (${tenantType}). Nothing in this codebase should be ` +
                  `creating a ${model} as a ${tenantType} — if that changed, this ` +
                  `needs a real design, not a default.`
              );
            }
            const scoped = args as {
              data: Record<string, unknown> | Record<string, unknown>[];
            };
            scoped.data = Array.isArray(scoped.data)
              ? scoped.data.map((row) => ({ ...row, [scope.column]: tenantId }))
              : { ...scoped.data, [scope.column]: tenantId };
            return query(scoped);
          }

          return query(args);
        },
      },
    },
  });
}

export type ScopedClient = ReturnType<typeof scopedClient>;
