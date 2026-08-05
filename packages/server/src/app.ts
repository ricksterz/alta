import "express-async-errors";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { investorsRouter } from "./routes/investors.js";
import { errorHandler } from "./middleware/errorHandler.js";

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

  app.use(errorHandler);

  return app;
}
