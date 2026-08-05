import type { AdvisorRole } from "@prisma/client";
import type { ScopedClient } from "../db/scopedClient.js";

export interface RequestContext {
  tenantId: string;
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
