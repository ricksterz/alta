import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptField,
  decryptOptional,
  encryptField,
  encryptOptional,
  isEncrypted,
  maskTaxId,
  resetKeyCache,
  taxIdMatches,
} from "./fieldEncryption.js";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

beforeAll(() => {
  process.env.TIN_ENCRYPTION_KEY = TEST_KEY;
  resetKeyCache();
});

describe("round trip", () => {
  it("recovers the original value", () => {
    expect(decryptField(encryptField("123-45-6789"))).toBe("123-45-6789");
  });

  it("produces different ciphertext each time for the same input", () => {
    // A deterministic ciphertext would leak that two investors share a TIN.
    const a = encryptField("12-3456789");
    const b = encryptField("12-3456789");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it("never stores the plaintext inside the ciphertext", () => {
    expect(encryptField("123-45-6789")).not.toContain("123-45-6789");
    expect(encryptField("123456789")).not.toContain("123456789");
  });
});

describe("tamper detection", () => {
  it("refuses a modified ciphertext rather than returning wrong plaintext", () => {
    const enc = encryptField("123-45-6789");
    const parts = enc.split(":");
    const ct = Buffer.from(parts[3]!, "base64url");
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString("base64url");
    expect(() => decryptField(parts.join(":"))).toThrow();
  });

  it("refuses a swapped auth tag", () => {
    const a = encryptField("111-11-1111").split(":");
    const b = encryptField("222-22-2222").split(":");
    a[2] = b[2]!;
    expect(() => decryptField(a.join(":"))).toThrow();
  });

  it("rejects a malformed value", () => {
    expect(() => decryptField("v1:only-two-parts")).toThrow(/Malformed/);
  });
});

describe("incremental migration", () => {
  it("passes through a plaintext value written before encryption landed", () => {
    // Lets the backfill run without taking reads down mid-migration.
    expect(decryptField("123-45-6789")).toBe("123-45-6789");
    expect(isEncrypted("123-45-6789")).toBe(false);
  });

  it("does not double-encrypt an already-encrypted value", () => {
    const once = encryptOptional("12-3456789")!;
    expect(encryptOptional(once)).toBe(once);
  });

  it("handles null and empty consistently", () => {
    expect(encryptOptional(null)).toBeNull();
    expect(encryptOptional("")).toBeNull();
    expect(decryptOptional(null)).toBeNull();
  });
});

describe("masking for API responses", () => {
  it("returns only the last four digits", () => {
    expect(maskTaxId(encryptField("123-45-6789"))).toBe("•••••6789");
    expect(maskTaxId(encryptField("12-3456789"))).toBe("•••••6789");
  });

  it("never leaks the full value", () => {
    const masked = maskTaxId(encryptField("123-45-6789"))!;
    expect(masked).not.toContain("123");
    expect(masked).not.toContain("45");
  });

  it("masks plaintext legacy values too", () => {
    expect(maskTaxId("123-45-6789")).toBe("•••••6789");
  });

  it("degrades safely on a too-short value", () => {
    expect(maskTaxId(encryptField("12"))).toBe("••••");
    expect(maskTaxId(null)).toBeNull();
  });
});

describe("key handling", () => {
  it("refuses to operate without a key", () => {
    const saved = process.env.TIN_ENCRYPTION_KEY;
    delete process.env.TIN_ENCRYPTION_KEY;
    resetKeyCache();
    expect(() => encryptField("x")).toThrow(/TIN_ENCRYPTION_KEY is not set/);
    process.env.TIN_ENCRYPTION_KEY = saved;
    resetKeyCache();
  });

  it("refuses a key of the wrong length", () => {
    const saved = process.env.TIN_ENCRYPTION_KEY;
    process.env.TIN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    resetKeyCache();
    expect(() => encryptField("x")).toThrow(/must decode to 32 bytes/);
    process.env.TIN_ENCRYPTION_KEY = saved;
    resetKeyCache();
  });

  it("cannot decrypt with a different key", () => {
    const enc = encryptField("123-45-6789");
    const saved = process.env.TIN_ENCRYPTION_KEY;
    process.env.TIN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    resetKeyCache();
    expect(() => decryptField(enc)).toThrow();
    process.env.TIN_ENCRYPTION_KEY = saved;
    resetKeyCache();
  });
});

describe("constant-time comparison", () => {
  it("matches the correct value and rejects others", () => {
    const enc = encryptField("123-45-6789");
    expect(taxIdMatches(enc, "123-45-6789")).toBe(true);
    expect(taxIdMatches(enc, "123-45-6788")).toBe(false);
    expect(taxIdMatches(enc, "shorter")).toBe(false);
  });
});
