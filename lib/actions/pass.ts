"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { db } from "../db";
import { randomToken } from "../crypto";
import { logEvent } from "../bot/engine";

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
    await sql`insert into pass_accounts (id, label, firm, script) values (${`pa_${randomToken(9)}`}, ${`${firm === "lucid" ? "Lucid" : "Topstep"} ${n + 1}`}, ${firm}, ${firm === "lucid" ? "C" : "D"})`;
    done();
    return { ok: true };
  });
}

const Fields = z.object({
  label: z.string().trim().min(1).max(60),
  firm: z.enum(["topstep", "lucid"]),
  stage: z.enum(["eval", "funded", "prelive"]),
  script: z.enum(["C", "D"]),
  topstepAccount: z.string().trim().max(80),
  contracts: z.number().int().min(1).max(50),
  dll: z.boolean(),
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
    const [prev] = await sql<{ stage: string }[]>`select stage from pass_accounts where id = ${Id.parse(id)}`;
    await sql`
      update pass_accounts set label = ${f.label}, firm = ${f.firm}, stage = ${stage}, script = ${f.script}, topstep_account = ${f.topstepAccount || null},
        contracts = ${f.contracts}, dll = ${f.dll}, enabled = ${f.enabled}, dry_run = ${f.dryRun},
        base_profit = ${f.baseProfit}, base_best = ${f.baseBest}, base_win_days = ${f.baseWinDays},
        -- A new stage (or switching it back on) starts fresh: the finished mark goes.
        done = case when ${stage} <> stage or (${f.enabled} and not enabled) then null else done end,
        done_note = case when ${stage} <> stage or (${f.enabled} and not enabled) then null else done_note end
      where id = ${Id.parse(id)}
    `;
    if (prev && prev.stage !== stage) await logEvent("info", `Pass plan · ${f.label}: now ${stage.toUpperCase()}`);
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
