"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isConfigured } from "../env";
import { safeEqual } from "../crypto";
import {
  assertSession,
  clientIpHash,
  createSession,
  destroyAllSessions,
  destroyCurrentSession,
} from "../auth/session";
import { checkUnlockRateLimit, recordAttempt } from "../auth/ratelimit";
import { deletePasskey, passkeyCount } from "../auth/passkeys";
import { changePassphrase, claimOwner, hasOwner, normalizeCode, setupCode, verifyPassphrase } from "../auth/owner";
import { getSettings, saveSetting } from "../data/settings";

export type UnlockState = { error?: string };

const MIN_PASSPHRASE = 12;
const slowDown = () => new Promise((r) => setTimeout(r, 700));

export async function unlockWithPassphrase(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  if (!isConfigured()) return { error: "The app isn't configured yet." };
  const passphrase = String(formData.get("passphrase") ?? "");
  if (!passphrase || passphrase.length > 512) return { error: "Enter your passphrase." };

  const ipHash = await clientIpHash();
  const limit = await checkUnlockRateLimit(ipHash);
  if (!limit.ok) return { error: limit.reason };

  const settings = await getSettings();
  if (settings.security.passkeyOnly && (await passkeyCount()) > 0) {
    return { error: "Passphrase unlock is disabled. Use your passkey." };
  }

  const ok = await verifyPassphrase(passphrase);
  await recordAttempt(ipHash, ok);
  if (!ok) {
    await slowDown();
    return { error: "That's not it." };
  }
  await createSession("passphrase");
  redirect("/");
}

/**
 * First launch: whoever holds the setup code (derived from ENCRYPTION_KEY,
 * which only the Vercel project owner has) sets the passphrase. Works once.
 */
export async function claimJournal(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  if (!isConfigured()) return { error: "The app isn't configured yet." };
  if (await hasOwner()) return { error: "This journal has already been claimed. Unlock it instead." };

  const code = normalizeCode(String(formData.get("code") ?? ""));
  const passphrase = String(formData.get("passphrase") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const ipHash = await clientIpHash();
  const limit = await checkUnlockRateLimit(ipHash);
  if (!limit.ok) return { error: limit.reason };

  const codeOk = code.length === 12 && safeEqual(code, normalizeCode(setupCode()));
  if (!codeOk) {
    await recordAttempt(ipHash, false);
    await slowDown();
    return { error: "That setup code doesn't match this deployment's ENCRYPTION_KEY." };
  }
  if (passphrase.length < MIN_PASSPHRASE) return { error: `Use at least ${MIN_PASSPHRASE} characters — a short sentence is perfect.` };
  if (passphrase.length > 512) return { error: "That passphrase is too long." };
  if (passphrase !== confirm) return { error: "The two passphrases don't match." };

  const claimed = await claimOwner(passphrase);
  await recordAttempt(ipHash, claimed);
  if (!claimed) return { error: "This journal has already been claimed." };
  await createSession("passphrase");
  redirect("/?welcome=1");
}

export async function updatePassphrase(_prev: UnlockState, formData: FormData): Promise<UnlockState & { ok?: boolean }> {
  await assertSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!(await verifyPassphrase(current))) {
    await slowDown();
    return { error: "Your current passphrase is wrong." };
  }
  if (next.length < MIN_PASSPHRASE) return { error: `Use at least ${MIN_PASSPHRASE} characters.` };
  if (next.length > 512) return { error: "That passphrase is too long." };
  if (next !== confirm) return { error: "The new passphrases don't match." };
  await changePassphrase(next);
  return { ok: true };
}

export async function lockNow() {
  await destroyCurrentSession();
  redirect("/unlock");
}

export async function signOutEverywhere() {
  await assertSession();
  await destroyAllSessions();
  redirect("/unlock");
}

export async function removePasskey(id: string) {
  await assertSession();
  await deletePasskey(String(id));
  if ((await passkeyCount()) === 0) {
    const settings = await getSettings();
    await saveSetting("security", { ...settings.security, passkeyOnly: false });
  }
  revalidatePath("/settings");
}

export async function setPasskeyOnly(enabled: boolean): Promise<{ error?: string }> {
  await assertSession();
  if (enabled && (await passkeyCount()) === 0) return { error: "Add a passkey first." };
  const settings = await getSettings();
  await saveSetting("security", { ...settings.security, passkeyOnly: Boolean(enabled) });
  revalidatePath("/settings");
  return {};
}
