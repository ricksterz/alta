import { PrismaClient } from "@prisma/client";

// The unscoped client. Only ever touched in two places: session/tenant
// resolution during auth (before we know which tenant we're scoped to), and
// the seed script. Route handlers must use req.ctx.db (see scopedClient.ts)
// instead — never import this directly in a route.
export const prisma = new PrismaClient();
