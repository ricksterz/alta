import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Application-level encryption for the few columns that hold a raw taxpayer
// identifier — a full SSN or EIN. These are the most sensitive values Alta
// stores, and until now they sat in plaintext behind a comment promising to
// fix it later.
//
// AES-256-GCM, which authenticates as well as encrypts: a tampered ciphertext
// fails to decrypt rather than silently yielding wrong plaintext. That matters
// here because the plaintext lands on a document someone signs.
//
// Format: v1:<iv>:<authTag>:<ciphertext>, all base64url. Self-describing so a
// future key rotation can recognise and re-wrap v1 values rather than guessing
// at what it is looking at.
//
// Scope, stated honestly: this protects data at rest — a database dump, a
// stolen backup, a careless read replica. It does NOT protect against an
// attacker who already has application memory or the key, because the running
// process must be able to decrypt to fill a document. Column-level encryption
// buys a specific, bounded thing; treating it as general protection would be
// the mistake.

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32;

export class EncryptionKeyError extends Error {}

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TIN_ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionKeyError(
      "TIN_ENCRYPTION_KEY is not set. Taxpayer identifiers cannot be stored or " +
        "read without it. Generate one with: openssl rand -base64 32"
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new EncryptionKeyError(
      `TIN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${buf.length}). ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  cachedKey = buf;
  return buf;
}

/** For tests that swap keys between cases. */
export function resetKeyCache() {
  cachedKey = null;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(":");
}

export function decryptField(stored: string): string {
  if (!isEncrypted(stored)) {
    // A value written before encryption landed. Returned as-is rather than
    // throwing, so the migration can run incrementally and a half-migrated
    // table still serves reads. Remove this branch once backfill is verified.
    return stored;
  }
  const [, ivB64, tagB64, ctB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted field: expected v1:<iv>:<tag>:<ciphertext>");
  }
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  return isEncrypted(value) ? value : encryptField(value);
}

export function decryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  return decryptField(value);
}

/**
 * What the API returns instead of a taxpayer identifier. The full value never
 * leaves the server: a rep confirming they entered the right number needs the
 * last four, not the whole thing, and the browser is the easiest place for it
 * to end up somewhere it shouldn't.
 */
export function maskTaxId(value: string | null | undefined): string | null {
  if (!value) return null;
  const plain = decryptOptional(value);
  if (!plain) return null;
  const digits = plain.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••••${digits.slice(-4)}`;
}

/** Constant-time compare, for verifying a re-entered identifier without leaking timing. */
export function taxIdMatches(stored: string, candidate: string): boolean {
  const a = Buffer.from(decryptField(stored));
  const b = Buffer.from(candidate);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
