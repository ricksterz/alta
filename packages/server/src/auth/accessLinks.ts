import { createHash, randomBytes } from "node:crypto";

// Same discipline as session.ts: only the hash is ever persisted, so a
// database read alone can never hand out a usable token.
export function generateAccessToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAccessToken(token);
  return { token, tokenHash };
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** True if a link may still be used to view its investor's data. */
export function isAccessLinkUsable(
  link: { revokedAt: Date | null; expiresAt: Date },
  now = new Date()
): boolean {
  return link.revokedAt === null && link.expiresAt > now;
}
