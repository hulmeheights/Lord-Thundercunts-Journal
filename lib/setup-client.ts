/**
 * Browser-only helpers for first-time setup. Secrets are generated with the
 * Web Crypto API on the owner's own device and never sent to the server.
 */

const STORE = "ltj:setup-env";

export type SetupEnv = { encryptionKey: string; cronSecret: string; code: string };

function randomKey(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Must match lib/auth/owner.ts → setupCode(). */
export async function computeSetupCode(encryptionKey: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(encryptionKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("ltj-claim-v1")));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export function loadSetupEnv(): SetupEnv | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const v = JSON.parse(raw) as SetupEnv;
    return v.encryptionKey && v.cronSecret && v.code ? v : null;
  } catch {
    return null;
  }
}

export async function createSetupEnv(): Promise<SetupEnv> {
  const encryptionKey = randomKey(36);
  const v: SetupEnv = { encryptionKey, cronSecret: randomKey(24), code: await computeSetupCode(encryptionKey) };
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    /* private mode — still usable this session */
  }
  return v;
}

export function clearSetupEnv() {
  try {
    localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}
