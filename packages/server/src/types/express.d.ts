import type { AdvisorRole, TenantType } from "@prisma/client";
import type { ScopedClient } from "../db/scopedClient.js";

export interface RequestContext {
  tenantId: string;
  tenantType: TenantType;
  advisorRepId: string;
  role: AdvisorRole;
  db: ScopedClient;
}

declare global {
  namespace Express {
    interface Request {
      ctx?: RequestContext;
    }
  }
}
