import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "alta_session";

export function generateSessionToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  return { token, tokenHash };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
