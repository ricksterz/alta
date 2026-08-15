import { Router, type Request, type Response } from "express";
import cookie from "cookie";
import { z } from "zod";
import type { TenantType } from "@prisma/client";
import { prisma } from "../db/client.js";
import { scopedClient } from "../db/scopedClient.js";
import { verifyPassword } from "../auth/password.js";
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from "../auth/session.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { audit } from "../audit.js";
import { env } from "../env.js";

export const authRouter = Router();

// Issues the session cookie and audit event for an authenticated rep. Shared
// by password login and demo login so the two can't drift — a demo session is
// a real session, subject to the same TTL and the same tenant scoping.
async function establishSession(
  req: Request,
  res: Response,
  advisorRep: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string;
    tenant: { type: TenantType };
  },
  action: "auth.login" | "auth.demo_login"
) {
  const db = scopedClient(advisorRep.tenantId, advisorRep.tenant.type);
  const { token, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  await db.session.create({
    data: {
      tenantId: advisorRep.tenantId,
      advisorRepId: advisorRep.id,
      tokenHash,
      expiresAt,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
    },
  });

  await audit(db, advisorRep.tenantId, {
    actorType: "advisor_rep",
    actorId: advisorRep.id,
    action,
    entityType: "AdvisorRep",
    entityId: advisorRep.id,
  });

  res.setHeader(
    "Set-Cookie",
    cookie.serialize(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: env.SESSION_TTL_HOURS * 60 * 60,
    })
  );

  res.json({
    id: advisorRep.id,
    email: advisorRep.email,
    firstName: advisorRep.firstName,
    lastName: advisorRep.lastName,
    role: advisorRep.role,
    tenantId: advisorRep.tenantId,
    tenantType: advisorRep.tenant.type,
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password format" });
  }
  const { email, password } = parsed.data;

  // Email is globally unique, so this is the one legitimate unscoped lookup:
  // we don't know the tenant until we know who's logging in.
  const advisorRep = await prisma.advisorRep.findUnique({
    where: { email },
    include: { tenant: { select: { type: true } } },
  });
  if (!advisorRep || !advisorRep.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await verifyPassword(password, advisorRep.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  await establishSession(req, res, advisorRep, "auth.login");
});

// ---------------------------------------------------------------------------
// Demo role switching — no password
// ---------------------------------------------------------------------------
// The demo build lets a visitor step into any ecosystem role to see the
// platform from that side, which is the whole point of a multi-party product
// that's hard to explain in the abstract.
//
// The safety property is the allowlist below, not the absence of one: this
// endpoint can only ever authenticate one of these six seeded fixtures. Adding
// a real user to the database does not make them reachable here, because their
// address isn't in this list. Password login remains the only path for
// everyone else, unchanged.
//
// These accounts' passwords were already printed on the login screen, so this
// removes a step rather than exposure. It should still come out before the
// platform holds anything real — see the Demonstration system disclosure.
export interface DemoPersona {
  email: string;
  label: string;
  description: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    email: "admin@harborview.test",
    label: "Advisor",
    description: "Onboards investors and originates subscriptions on their behalf.",
  },
  {
    email: "gpops@ares.test",
    label: "Fund Sponsor (GP)",
    description: "Runs the funds — sets terms and share classes, countersigns, accepts.",
  },
  {
    email: "ops@northbridge.test",
    label: "Fund Administrator",
    description: "Reviews subscriptions the GP has countersigned and admits them.",
  },
  {
    email: "counsel@sterlingcross.test",
    label: "Fund Counsel",
    description: "Approves or rejects subscription document templates before they go live.",
  },
  {
    email: "ops@meridiantrust.test",
    label: "Custodian",
    description: "Confirms capital actually landed, which is what makes a subscription funded.",
  },
];

const DEMO_EMAILS = new Set(DEMO_PERSONAS.map((p) => p.email));

authRouter.get("/demo-personas", (_req, res) => {
  res.json(DEMO_PERSONAS);
});

const demoLoginSchema = z.object({ email: z.string().email() });

authRouter.post("/demo-login", async (req, res) => {
  const parsed = demoLoginSchema.safeParse(req.body);
  if (!parsed.success || !DEMO_EMAILS.has(parsed.data.email)) {
    return res.status(403).json({ error: "Not a demo account" });
  }

  const advisorRep = await prisma.advisorRep.findUnique({
    where: { email: parsed.data.email },
    include: { tenant: { select: { type: true } } },
  });
  if (!advisorRep || !advisorRep.isActive) {
    return res.status(404).json({ error: "Demo account not found — has the database been seeded?" });
  }

  await establishSession(req, res, advisorRep, "auth.demo_login");
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const ctx = req.ctx!;
  const cookies = cookie.parse(req.headers.cookie ?? "");
  const token = cookies[SESSION_COOKIE_NAME];

  if (token) {
    await ctx.db.session.deleteMany({
      where: { tokenHash: hashSessionToken(token), advisorRepId: ctx.advisorRepId },
    });
  }

  await audit(ctx.db, ctx.tenantId, {
    actorType: "advisor_rep",
    actorId: ctx.advisorRepId,
    action: "auth.logout",
    entityType: "AdvisorRep",
    entityId: ctx.advisorRepId,
  });

  res.setHeader(
    "Set-Cookie",
    cookie.serialize(SESSION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 })
  );
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const ctx = req.ctx!;
  const advisorRep = await ctx.db.advisorRep.findFirst({
    where: { id: ctx.advisorRepId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      tenantId: true,
    },
  });
  res.json({ ...advisorRep, tenantType: ctx.tenantType });
});
