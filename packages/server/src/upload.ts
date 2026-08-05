import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "./env.js";

// Local-disk stub for Phase 1 — no virus scan, no S3, no KYC vendor. Files
// land under UPLOAD_ROOT/<tenantId>/<investorId>/, keyed by a random name so
// the original filename (still recorded in the DB) never becomes a path.
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const tenantId = req.ctx?.tenantId;
    const investorId = req.params.id;
    if (!tenantId || !investorId) {
      return cb(new Error("Missing tenant or investor context for upload"), "");
    }
    const dir = path.join(env.UPLOAD_ROOT, tenantId, investorId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});
