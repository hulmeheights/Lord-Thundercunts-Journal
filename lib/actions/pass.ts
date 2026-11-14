"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { db } from "../db";
import { randomToken } from "../crypto";
import { logEvent } from "../bot/engine";
import { cleanOverrides, defaults, money, type SavedSettings, type Stage, type StageCfg } from "../pass/rules";
import { statsFor, type PassAccountRow } from "../pass/server";

const done = () => revalidatePath("/pass");
const Id = z.string().regex(/^pa_[A-Za-z0-9_-]{6,40}$/);

async function safely<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error("pass action failed", e);
    return { error: `Couldn't save: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` };
  }
}

/** The pass plan's own master switch (Autopilot's SOR switch is separate). */
export async function setPassMode(on: boolean) {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    await sql`update pass_settings set mode = ${on ? "on" : "off"} where id = 1`;
    await logEvent("warn", `Pass plan switched ${on ? "ON" : "OFF"}`);
    done();
    return { ok: true };
  });
}

export async function addPassAccount(firm: "topstep" | "lucid") {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from pass_accounts`;
    if (n >= 30) return { error: "That's the most cards (30)." };
    await sql`insert into pass_accounts (id, label, firm, script) values (${`pa_${randomToken(9)}`}, ${`${firm === "lucid" ? "Lucid" : "Topstep"} ${n + 1}`}, ${firm}, ${"C"})`;
    done();
    return { ok: true };
  });
}

const Fields = z.object({
  label: z.string().trim().min(1).max(60),
  firm: z.enum(["topstep", "lucid"]),
  stage: z.enum(["eval", "funded", "prelive"]),
  script: z.enum(["A", "C", "D"]),
  topstepAccount: z.string().trim().max(80),
  dll: z.boolean(),
  /** This stage's settings, whole; only what differs from the tested defaults is kept. */
  settings: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.null()])),
  floorLocked: z.boolean(),
  enabled: z.boolean(),
  dryRun: z.boolean(),
  baseProfit: z.number().finite().min(-10_000).max(100_000),
  baseBest: z.number().finite().min(0).max(100_000),
  baseWinDays: z.number().int().min(0).max(100),
});

export async function savePassAccount(id: string, v: z.input<typeof Fields>) {
  await assertSession();
  return safely(async () => {
    const f = Fields.parse(v);
    // Topstep: eval → funded. Lucid: step 1 (eval) → pre-live.
    const stage = f.firm === "lucid" ? (f.stage === "eval" ? "eval" : "prelive") : f.stage === "eval" ? "eval" : "funded";
    if (f.enabled && f.firm === "topstep" && !f.dryRun && !f.topstepAccount) return { error: "Set the TopstepX account before switching real orders on." };
    const sql = await db();
    const [prev] = await sql<{ stage: Stage; firm: string; settings: SavedSettings | null }[]>`select stage, firm, settings from pass_accounts where id = ${Id.parse(id)}`;
    if (!prev) return { error: "That card is gone." };
    // A new stage starts from zero: nothing carried over from before the bot, the floor trails again, old trades don't count.
    const fresh = prev.stage !== stage;
    // Keep only what differs from this stage's tested defaults, so a setting you never touched follows the plan.
    const base = defaults(f.firm, stage, f.dll) as Record<string, unknown>;
    const mine = Object.fromEntries(Object.entries(cleanOverrides(f.settings)).filter(([k, v]) => base[k] !== v)) as Partial<StageCfg>;
    // Settings are the stage's own: switching firm or stage keeps the other stages' settings, and opens this one as it was left.
    const settings: SavedSettings = { ...(prev.firm === f.firm ? (prev.settings ?? {}) : {}), ...(fresh || prev.firm !== f.firm ? {} : { [stage]: mine }) };
    await sql`
      update pass_accounts set label = ${f.label}, firm = ${f.firm}, stage = ${stage}, script = ${f.script}, topstep_account = ${f.topstepAccount || null},
        dll = ${f.dll}, enabled = ${f.enabled}, dry_run = ${f.dryRun}, settings = ${sql.json(settings as never)},
        base_profit = ${fresh ? 0 : f.baseProfit}, base_best = ${fresh ? 0 : f.baseBest}, base_win_days = ${fresh ? 0 : f.baseWinDays},
        floor_locked = ${fresh ? false : f.floorLocked}, stats_from = case when ${fresh} then now() else stats_from end,
        -- A new stage (or switching it back on) starts fresh: the finished mark goes.
        done = case when ${stage} <> stage or (${f.enabled} and not enabled) then null else done end,
        done_note = case when ${stage} <> stage or (${f.enabled} and not enabled) then null else done_note end
      where id = ${Id.parse(id)}
    `;
    if (fresh) await logEvent("info", `Pass plan · ${f.label}: now ${stage.toUpperCase()}, starting from zero`);
    done();
    return { ok: true };
  });
}

/** Back to the tested numbers for the card's current stage. */
export async function resetPassSettings(id: string) {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    await sql`update pass_accounts set settings = settings - stage where id = ${Id.parse(id)}`;
    done();
    return { ok: true };
  });
}

/**
 * You've requested the payout: the amount comes off the profit, the loss floor
 * is $0 for good, winning days start again, and the same funded account carries on.
 */
export async function payoutTaken(id: string, amount: number) {
  await assertSession();
  return safely(async () => {
    const paid = z.number().finite().min(1).max(200_000).parse(amount);
    const sql = await db();
    const [a] = await sql<PassAccountRow[]>`select * from pass_accounts where id = ${Id.parse(id)}`;
    if (!a) return { error: "That card is gone." };
    if (a.stage !== "funded") return { error: "Payouts are for funded accounts." };
    const [open] = await sql<{ n: number }[]>`select count(*)::int as n from pass_trades where account_id = ${a.id} and status in ('open', 'pending')`;
    if (open?.n) return { error: "A trade is open on this account: wait for it to close first." };
    const st = await statsFor(a);
    const left = Math.round((st.profit - paid) * 100) / 100;
    if (left <= 0) return { error: `That would leave ${money(left)}: the account needs something left to trade with.` };
    await sql`
      update pass_accounts set base_profit = ${left}, base_best = 0, base_win_days = 0, floor_locked = true, stats_from = now(), payouts = payouts + 1,
        done = null, done_note = null, enabled = true
      where id = ${a.id}
    `;
    await logEvent("info", `Pass plan · ${a.label}: payout of ${money(paid)} taken. ${money(left)} left, loss limit fixed at $0, winning days back to 0. Trading on.`);
    done();
    return { ok: true };
  });
}

export async function deletePassAccount(id: string) {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    const r = await sql`delete from pass_accounts where id = ${Id.parse(id)} and not enabled returning id`;
    done();
    return r.length ? { ok: true } : { error: "Switch the card off first." };
  });
}
