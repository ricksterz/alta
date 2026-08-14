import { describe, expect, it } from "vitest";
import { generateAccessToken, hashAccessToken, isAccessLinkUsable } from "./accessLinks.js";

// What actually protects an LP link: the raw token is never stored, so a
// database compromise alone can't hand out a usable one, and a revoked or
// expired link must stop resolving immediately, not just stop being listed.

describe("token generation", () => {
  it("hashes deterministically, so the same token always resolves the same row", () => {
    const { token, tokenHash } = generateAccessToken();
    expect(hashAccessToken(token)).toBe(tokenHash);
  });

  it("never generates the same token twice in practice", () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("the hash reveals nothing about the token itself", () => {
    const { token, tokenHash } = generateAccessToken();
    expect(tokenHash).not.toContain(token);
  });
});

describe("isAccessLinkUsable", () => {
  const future = new Date("2027-01-01");
  const past = new Date("2020-01-01");
  const now = new Date("2026-06-01");

  it("is usable when not revoked and not yet expired", () => {
    expect(isAccessLinkUsable({ revokedAt: null, expiresAt: future }, now)).toBe(true);
  });

  it("is not usable once revoked, even if not yet expired", () => {
    expect(isAccessLinkUsable({ revokedAt: now, expiresAt: future }, now)).toBe(false);
  });

  it("is not usable once expired, even if never revoked", () => {
    expect(isAccessLinkUsable({ revokedAt: null, expiresAt: past }, now)).toBe(false);
  });

  it("treats the exact expiry instant as expired, not usable", () => {
    expect(isAccessLinkUsable({ revokedAt: null, expiresAt: now }, now)).toBe(false);
  });
});
