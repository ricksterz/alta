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
    include: { advisorRep: { include: { tenant: true } } },
  });

  if (!session || session.expiresAt < new Date() || !session.advisorRep.isActive) {
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  req.ctx = {
    tenantId: session.tenantId,
    tenantType: session.advisorRep.tenant.type,
    advisorRepId: session.advisorRepId,
    role: session.advisorRep.role,
    db: scopedClient(session.tenantId, session.advisorRep.tenant.type),
  };

  next();
}

// Phase 2 route guards. Role (gp_ops vs advisor_rep/admin) and tenant type
// (sponsor_firm vs advisor_firm) are meant to move together — gp_ops only
// exists on sponsor tenants — so these check tenantType, the coarser and
// more load-bearing of the two, rather than role.
export function requireSponsorTenant(req: Request, res: Response, next: NextFunction) {
  if (req.ctx?.tenantType !== "sponsor_firm") {
    return res.status(403).json({ error: "Sponsor tenant required" });
  }
  next();
}

// "Advisor-side" now covers two tenant types: an advisor firm acting for its
// clients, and a direct investor acting for themselves. Both originate their
// own subscriptions the same way — the routes gated here don't need to know
// which one they're talking to.
export function requireAdvisorTenant(req: Request, res: Response, next: NextFunction) {
  if (req.ctx?.tenantType !== "advisor_firm" && req.ctx?.tenantType !== "investor_direct") {
    return res.status(403).json({ error: "Advisor tenant required" });
  }
  next();
}

export function requireFundAdminTenant(req: Request, res: Response, next: NextFunction) {
  if (req.ctx?.tenantType !== "fund_admin") {
    return res.status(403).json({ error: "Fund administrator tenant required" });
  }
  next();
}

export function requireFundLegalTenant(req: Request, res: Response, next: NextFunction) {
  if (req.ctx?.tenantType !== "fund_legal") {
    return res.status(403).json({ error: "Fund counsel tenant required" });
  }
  next();
}

export function requireCustodianTenant(req: Request, res: Response, next: NextFunction) {
  if (req.ctx?.tenantType !== "custodian") {
    return res.status(403).json({ error: "Custodian tenant required" });
  }
  next();
}

// A template's detail view is read by the sponsor who owns it and by the
// counsel reviewing it; scopedClient's own DocumentTemplate scope already
// keeps each to their own funds, so this only needs to gate tenant *type*.
export function requireSponsorOrFundLegal(req: Request, res: Response, next: NextFunction) {
  if (req.ctx?.tenantType !== "sponsor_firm" && req.ctx?.tenantType !== "fund_legal") {
    return res.status(403).json({ error: "Sponsor or fund counsel tenant required" });
  }
  next();
}

// Fund-admin review is performed by the administrator when one is engaged and
// by the sponsor otherwise, so routes covering that step accept either and
// defer the actual decision to the state machine, which knows whether the
// specific fund has an administrator.
export function requireSponsorOrFundAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.ctx?.tenantType !== "sponsor_firm" && req.ctx?.tenantType !== "fund_admin") {
    return res.status(403).json({ error: "Sponsor or fund administrator tenant required" });
  }
  next();
}
