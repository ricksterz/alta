import type { NextFunction, Request, Response } from "express";
import cookie from "cookie";
import { prisma } from "../db/client.js";
import { scopedClient } from "../db/scopedClient.js";
import { SESSION_COOKIE_NAME, hashSessionToken } from "../auth/session.js";

// Establishes req.ctx. This is the one place per request allowed to touch
// the unscoped prisma client — it has to, since we don't know the caller's
// tenant until we've resolved their session. Everything after this
// middleware (every route handler) works exclusively through req.ctx.db.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = cookie.parse(req.headers.cookie ?? "");
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { advisorRep: true },
  });

  if (!session || session.expiresAt < new Date() || !session.advisorRep.isActive) {
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  req.ctx = {
    tenantId: session.tenantId,
    advisorRepId: session.advisorRepId,
    role: session.advisorRep.role,
    db: scopedClient(session.tenantId),
  };

  next();
}
