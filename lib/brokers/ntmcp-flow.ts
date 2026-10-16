import "server-only";
import { decryptJson, encryptJson, safeEqual } from "../crypto";
import type { NtEnv } from "./ntmcp-parse";

/** The short-lived state of one "Log in with Tradovate" attempt, sealed in a cookie. */
export type NtFlow = { state: string; verifier: string; clientId: string; env: NtEnv; redirectUri: string; exp: number };

export const FLOW_COOKIE = "ltj_ntflow";
export const FLOW_TTL_S = 600;
const PURPOSE = "ntmcp:flow";

export const sealFlow = (f: NtFlow) => encryptJson(f, PURPOSE);

/** Returns the flow only if the cookie is ours, unexpired, and its state matches the one Tradovate echoed. */
export function openFlow(sealed: string | undefined, state: string | null): NtFlow | null {
  if (!sealed || !state) return null;
  try {
    const f = decryptJson<NtFlow>(sealed, PURPOSE);
    if (f.exp < Date.now() || !safeEqual(f.state, state)) return null;
    return f;
  } catch {
    return null;
  }
}
