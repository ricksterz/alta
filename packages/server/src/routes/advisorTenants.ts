import { Router } from "express";
import { requireAuth, requireSponsorTenant } from "../middleware/requireAuth.js";

// Sponsor-only lookup for the entitlement-grant screen — searches across
// ALL advisor tenants on the platform (Tenant is exempt from tenant
// scoping; that's correct here, not a leak: a sponsor choosing who to grant
// fund access to needs to see every advisor firm, not just its own).
export const advisorTenantsRouter = Router();
advisorTenantsRouter.use(requireAuth, requireSponsorTenant);

advisorTenantsRouter.get("/", async (req, res) => {
  const db = req.ctx!.db;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const tenants = await db.tenant.findMany({
    where: {
      type: "advisor_firm",
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: 25,
  });

  res.json(tenants);
});
