"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env, isConfigured } from "../env";
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
import { getSettings, saveSetting } from "../data/settings";

export type UnlockState = { error?: string };

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

  const ok = safeEqual(passphrase, env.ownerPassword);
  await recordAttempt(ipHash, ok);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return { error: "That's not it." };
  }
  await createSession("passphrase");
  redirect("/");
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
