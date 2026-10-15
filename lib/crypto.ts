import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Authenticated encryption (AES-256-GCM) for broker credentials and tokens.
 * The key is derived from ENCRYPTION_KEY (an env var that never touches the
 * database), so a database leak alone reveals nothing usable. Each value is
 * bound to its purpose via AAD so ciphertexts can't be swapped between rows.
 */
function deriveKey(): Buffer {
  const raw = env.encryptionKey;
  if (raw.length < 32) throw new Error("ENCRYPTION_KEY must be at least 32 characters");
  return Buffer.from(hkdfSync("sha256", raw, "ltj/v1/salt", "ltj/v1/credentials", 32));
}

export function encryptJson(value: unknown, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptJson<T>(payload: string, purpose: string): T {
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) throw new Error("Unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** A stable, non-secret device identifier derived from the encryption key. */
export function stableDeviceId(scope: string): string {
  const h = createHash("sha256").update(`${env.encryptionKey}:${scope}:device`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
