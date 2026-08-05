import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  SESSION_TTL_HOURS: z.coerce.number().default(24),
  UPLOAD_ROOT: z.string().default("./uploads"),
});

export const env = schema.parse(process.env);
