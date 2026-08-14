import { Router } from "express";
import { prisma } from "../db/client.js";
import { hashAccessToken, isAccessLinkUsable } from "../auth/accessLinks.js";

// The one unauthenticated, unscoped surface in the app: an LP holding a
// bearer link, not a session. There is no req.ctx here — no tenant, no rep —
// so this is (like requireAuth.ts) one of the few places allowed to touch
// the raw prisma client directly. Every query below is manually pinned to
// the single investorId the validated token names; nothing here ever takes
// an id from the request itself.
export const lpRouter = Router();

function investorDisplayName(inv: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  entityName: string | null;
}) {
  return inv.type === "entity" || inv.type === "trust"
    ? (inv.entityName ?? "(unnamed)")
    : `${inv.firstName ?? ""} ${inv.lastName ?? ""}`.trim() || "(unnamed)";
}

// ---------------------------------------------------------------------------
// GET /lp/:token — an LP's own standing: subscriptions and positions only.
// Deliberately excludes tax profile, SSN, and full address — this token
// travels in a URL (browser history, referrer headers, a forwarded email),
// so it carries less than a logged-in session would, not more.
// ---------------------------------------------------------------------------
lpRouter.get("/:token", async (req, res) => {
  const link = await prisma.investorAccessLink.findUnique({
    where: { tokenHash: hashAccessToken(req.params.token) },
  });
  if (!link || !isAccessLinkUsable(link)) {
    return res.status(404).json({ error: "This link is invalid or has expired" });
  }

  const investor = await prisma.investor.findUnique({
    where: { id: link.investorId },
    include: {
      subscriptions: {
        orderBy: { createdAt: "desc" },
        include: { fund: { select: { name: true } } },
      },
      positions: {
        orderBy: { createdAt: "desc" },
        include: { fund: { select: { name: true } } },
      },
    },
  });
  if (!investor) {
    return res.status(404).json({ error: "This link is invalid or has expired" });
  }

  await prisma.investorAccessLink.update({
    where: { id: link.id },
    data: { lastAccessedAt: new Date() },
  });

  res.json({
    investor: { displayName: investorDisplayName(investor), type: investor.type },
    subscriptions: investor.subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      amount: s.amount,
      fundName: s.fund.name,
      createdAt: s.createdAt,
    })),
    positions: investor.positions.map((p) => ({
      id: p.id,
      fundName: p.fund.name,
      commitmentAmount: p.commitmentAmount,
      fundedAmount: p.fundedAmount,
      status: p.status,
    })),
  });
});
