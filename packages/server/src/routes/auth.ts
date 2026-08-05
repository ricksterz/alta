import { Router } from "express";
import cookie from "cookie";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { scopedClient } from "../db/scopedClient.js";
import { verifyPassword } from "../auth/password.js";
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from "../auth/session.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { audit } from "../audit.js";
import { env } from "../env.js";

export const authRouter = Router();

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
  const advisorRep = await prisma.advisorRep.findUnique({ where: { email } });
  if (!advisorRep || !advisorRep.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await verifyPassword(password, advisorRep.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const db = scopedClient(advisorRep.tenantId);
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
    action: "auth.login",
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
  });
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
  res.json(advisorRep);
});
