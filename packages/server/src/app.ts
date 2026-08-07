import "express-async-errors";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { investorsRouter } from "./routes/investors.js";
import { fundsRouter } from "./routes/funds.js";
import { fundTemplatesRouter, templatesRouter } from "./routes/templates.js";
import { advisorTenantsRouter } from "./routes/advisorTenants.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { CANONICAL_FIELDS, CANONICAL_FIELD_REGISTRY_VERSION } from "./canonicalFields.js";

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

  app.get("/canonical-fields", requireAuth, (_req, res) => {
    res.json({ version: CANONICAL_FIELD_REGISTRY_VERSION, fields: CANONICAL_FIELDS });
  });

  app.use(errorHandler);

  return app;
}
