import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "../db";
import { env } from "../env";
import { safeEqual } from "../crypto";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/**
 * One-time setup code that proves whoever claims the journal also controls the
 * Vercel project (it's derived from ENCRYPTION_KEY, which only the owner has).
 * The setup page computes the same value in the browser with Web Crypto.
 */
export function setupCode(): string {
  const hex = createHmac("sha256", env.encryptionKey).update("ltj-claim-v1").digest("hex").slice(0, 12).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-F]/g, "");
}

export async function hasOwner(): Promise<boolean> {
  if (env.ownerPassword.length >= 12) return true;
  const sql = await db();
  const rows = await sql`select 1 from owner where id = 1`;
  return rows.length > 0;
}

async function hash(passphrase: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(passphrase.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

async function check(passphrase: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scrypt(passphrase.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  const sql = await db();
  const [row] = await sql<{ passphrase_hash: string }[]>`select passphrase_hash from owner where id = 1`;
  if (row) return check(passphrase, row.passphrase_hash);
  if (env.ownerPassword.length >= 12) return safeEqual(passphrase, env.ownerPassword);
  return false;
}

/** Creates the owner on first claim. Returns false if someone already claimed it. */
export async function claimOwner(passphrase: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    insert into owner (id, passphrase_hash) values (1, ${await hash(passphrase)})
    on conflict (id) do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function changePassphrase(passphrase: string): Promise<void> {
  const sql = await db();
  await sql`
    insert into owner (id, passphrase_hash) values (1, ${await hash(passphrase)})
    on conflict (id) do update set passphrase_hash = excluded.passphrase_hash, updated_at = now()
  `;
}
