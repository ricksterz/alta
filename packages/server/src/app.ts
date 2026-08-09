import "express-async-errors";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { investorsRouter } from "./routes/investors.js";
import { fundsRouter } from "./routes/funds.js";
import { fundTemplatesRouter, templatesRouter } from "./routes/templates.js";
import { advisorTenantsRouter } from "./routes/advisorTenants.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { positionsRouter } from "./routes/positions.js";
import { capitalCallsRouter } from "./routes/capitalCalls.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { CANONICAL_FIELDS, CANONICAL_FIELD_REGISTRY_VERSION } from "./canonicalFields.js";
import { QP_BASIS_LABELS, qpBasesForInvestorType } from "./workflow/eligibility.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/investors", investorsRouter);
  app.use("/funds", fundsRouter);
  app.use("/funds", fundTemplatesRouter); // /funds/:fundId/templates
  app.use("/templates", templatesRouter); // /templates/:id[/mappings/:mappingId]
  app.use("/advisor-tenants", advisorTenantsRouter);
  app.use("/subscriptions", subscriptionsRouter);
  app.use("/positions", positionsRouter);
  app.use("/capital-calls", capitalCallsRouter);

  app.get("/canonical-fields", requireAuth, (_req, res) => {
    res.json({ version: CANONICAL_FIELD_REGISTRY_VERSION, fields: CANONICAL_FIELDS });
  });

  // Qualified purchaser bases, with the investor types each applies to. Served
  // rather than duplicated in the frontend so the wizard's options and the
  // server's validation can't drift apart.
  app.get("/qp-bases", requireAuth, (_req, res) => {
    res.json(
      (Object.keys(QP_BASIS_LABELS) as (keyof typeof QP_BASIS_LABELS)[]).map((key) => ({
        key,
        label: QP_BASIS_LABELS[key],
        appliesTo: (["individual", "joint", "entity", "trust"] as const).filter((t) =>
          qpBasesForInvestorType(t).includes(key)
        ),
      }))
    );
  });

  app.use(errorHandler);

  return app;
}
