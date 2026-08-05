import type { Prisma } from "@prisma/client";
import type { ScopedClient } from "./db/scopedClient.js";

interface AuditInput {
  actorType: "advisor_rep" | "system";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

// The single write path to audit_events. Every mutating route calls this as
// its last step, passing the request's already tenant-scoped client. Note:
// the tenantId passed here is redundant with what scopedClient() injects at
// runtime (the extension always wins — see db/scopedClient.ts) — it's here
// only because Prisma's generated types require it on `data` at compile
// time. The extension remains the actual enforcement point, not this value.
export async function audit(db: ScopedClient, tenantId: string, input: AuditInput) {
  await db.auditEvent.create({
    data: {
      tenantId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
