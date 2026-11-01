"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { db } from "../db";
import { randomToken } from "../crypto";
import { botSetup } from "../bot/config";
import { logEvent } from "../bot/engine";
import { accounts, token } from "../bot/topstepx";

const done = () => revalidatePath("/autopilot");

/** Show what went wrong on the page, instead of the generic error screen, so a problem can be fixed. */
async function safely<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("autopilot action failed", e);
    return { error: `Couldn't save: ${msg.slice(0, 300)}` };
  }
}
const Id = z.string().regex(/^ba_[A-Za-z0-9_-]{6,40}$/);

/** Off / paper / live. Live needs the word LIVE typed, and the bot fully set up. */
export async function setBotMode(mode: "off" | "paper" | "live", confirm = "") {
  await assertSession();
  return safely(async () => {
    const m = z.enum(["off", "paper", "live"]).parse(mode);
    if (m === "live") {
      if (confirm.trim().toUpperCase() !== "LIVE") return { error: "Type LIVE to switch real orders on." };
      const s = botSetup();
      if (!s.secret || !s.topstep) return { error: "Finish the setup first: the webhook secret and the TopstepX API key must both be set." };
    }
    const sql = await db();
    await sql`update bot_settings set mode = ${m}, updated_at = now() where id = 1`;
    await logEvent(m === "live" ? "warn" : "info", `Autopilot switched ${m === "off" ? "OFF" : m === "paper" ? "to PAPER (no real orders)" : "LIVE (real orders)"}`);
    done();
    return { ok: true };
  });
}

const Fields = z.object({
  label: z.string().trim().min(1, "Name the card").max(60),
  topstepAccount: z.string().trim().max(80),
  contracts: z.number().int().min(1, "At least 1 contract").max(50),
  maxDailyLoss: z.number().positive("Set a daily loss limit").max(1_000_000),
  maxDailyWin: z.number().positive().max(1_000_000).nullable(),
  profitTarget: z.number().positive("The profit target is above 0, or blank for none").max(10_000_000).nullable(),
  startBalance: z.number().positive("Set the account's starting balance").max(100_000_000),
  enabled: z.boolean(),
});

export async function addBotAccount() {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from bot_accounts`;
    if (n >= 20) return { error: "20 cards at most." };
    await sql`insert into bot_accounts (id, label, contracts, max_daily_loss, enabled) values (${`ba_${randomToken(9)}`}, ${`Account ${n + 1}`}, 5, 500, false)`;
    done();
    return { ok: true };
  });
}

export async function saveBotAccount(id: string, v: z.input<typeof Fields>) {
  await assertSession();
  return safely(async () => {
    const parsed = Fields.safeParse(v);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the card." };
    const f = parsed.data;
    const sql = await db();
    await sql`
      update bot_accounts set label = ${f.label}, topstep_account = ${f.topstepAccount || null}, contracts = ${f.contracts},
        max_daily_loss = ${f.maxDailyLoss}, max_daily_win = ${f.maxDailyWin}, enabled = ${f.enabled},
        profit_target = ${f.profitTarget}, start_balance = ${f.startBalance},
        passed_at = case when ${f.enabled} then null else passed_at end
      where id = ${Id.parse(id)}
    `;
    done();
    return { ok: true };
  });
}

/** A card can only be deleted while it's switched off, so a live account is never dropped by accident. */
export async function deleteBotAccount(id: string) {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    const r = await sql`delete from bot_accounts where id = ${Id.parse(id)} and not enabled returning id`;
    done();
    return r.length ? { ok: true } : { error: "Switch the card off first." };
  });
}

/** Read-only check: logs in and lists your TopstepX accounts, so a card can be pointed at the right one. */
export async function checkTopstep(): Promise<{ accounts?: { id: number; name: string; canTrade: boolean; balance: number | null }[]; error?: string }> {
  await assertSession();
  try {
    const list = await accounts(await token());
    return { accounts: list.map((a) => ({ id: a.id, name: a.name, canTrade: a.canTrade !== false, balance: a.balance ?? null })) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't reach TopstepX." };
  }
}

/** The date the TradingView alert expires, so you're reminded before the bot goes silent. */
export async function setAlertExpiry(day: string | null) {
  await assertSession();
  return safely(async () => {
    const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().parse(day || null);
    const sql = await db();
    await sql`update bot_settings set alert_expires = ${d} where id = 1`;
    done();
    return { ok: true };
  });
}
