"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { botSetup } from "../bot/config";
import { CardRulesSchema, PHASE_DEFAULTS } from "../bot/sor";
import { logEvent } from "../bot/engine";
import { createRunnerToken, runnerStatus } from "../bot/runner";

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
      if (!s.secret) return { error: "Finish the setup first: the webhook secret must be set in Vercel." };
      if (!(await runnerStatus()).paired) return { error: "Connect your Mac first (Autopilot → Your Mac): Topstep needs orders to come from your own computer." };
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
  newsRule: z.boolean(),
  phase: z.enum(["eval", "funded"]).default("eval"),
  dryRun: z.boolean().default(true),
  rules: CardRulesSchema.optional(),
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
        profit_target = ${f.profitTarget}, start_balance = ${f.startBalance}, news_rule = ${f.newsRule}, phase = ${f.phase}, dry_run = ${f.dryRun},
        rules = ${sql.json((f.rules ?? PHASE_DEFAULTS[f.phase]) as never)},
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

/** How many minutes either side of high-impact news Autopilot stays out (0 = off). */
export async function setNewsMinutes(minutes: number) {
  await assertSession();
  return safely(async () => {
    const m = z.number().int().min(0).max(120).parse(minutes);
    const sql = await db();
    await sql`update bot_settings set news_minutes = ${m} where id = 1`;
    await logEvent("info", m ? `News blackout set to ${m} minutes either side` : "News blackout switched off");
    done();
    return { ok: true };
  });
}

/** A new key for the runner on your Mac (shown once; any older key stops working). */
export async function newRunnerKey(): Promise<{ key?: string; error?: string }> {
  await assertSession();
  try {
    const key = await createRunnerToken();
    await logEvent("info", "New key made for the runner on your Mac (any older key stopped working)");
    done();
    return { key };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Track record imports ────────────────────────────────────────────────────

const HistImportId = z.string().regex(/^bh_[A-Za-z0-9_-]{6,40}$/);
const HistRow = z.object({
  key: z.string().min(1).max(400),
  entryAt: z.string().datetime({ offset: true }),
  exitAt: z.string().datetime({ offset: true }).nullable(),
  dir: z.enum(["LONG", "SHORT"]),
  entry: z.number().finite().nullable(),
  exit: z.number().finite().nullable(),
  qty: z.number().positive().max(10_000),
  pnl: z.number().finite(),
  session: z.enum(["NYAM", "NYPM", "LON", "ASIA", "OTHER"]),
  account: z.string().max(120).nullable(),
  symbol: z.string().max(40).nullable(),
  signal: z.string().max(120).nullable(),
});
const HistChunk = z.object({
  importId: HistImportId,
  source: z.literal("tv"),
  fileName: z.string().max(200).nullish(),
  account: z.string().max(120).nullish(),
  trades: z.array(HistRow).min(1).max(1000),
});

/** One chunk of an imported trade list. Trades already kept are ignored, so the same export can go in again safely. */
export async function importHistory(input: z.input<typeof HistChunk>) {
  await assertSession();
  return safely(async () => {
    const p = HistChunk.parse(input);
    const sql = await db();
    const rows = p.trades.map((t) => ({
      id: `bh:${p.source}:${sha256(t.key).slice(0, 28)}`,
      source: p.source,
      import_id: p.importId,
      account: t.account,
      symbol: t.symbol,
      dir: t.dir,
      qty: t.qty,
      entry_at: new Date(t.entryAt),
      exit_at: t.exitAt ? new Date(t.exitAt) : null,
      entry_price: t.entry,
      exit_price: t.exit,
      pnl: t.pnl,
      session: t.session,
      signal: t.signal,
    }));
    const added = await sql`insert into bot_history ${sql(rows)} on conflict (id) do nothing returning id`;
    await sql`
      insert into bot_history_imports (id, source, file_name, account, rows, added)
      values (${p.importId}, ${p.source}, ${p.fileName ?? null}, ${p.account ?? null}, ${rows.length}, ${added.length})
      on conflict (id) do update set rows = bot_history_imports.rows + excluded.rows, added = bot_history_imports.added + excluded.added
    `;
    done();
    return { ok: true as const, added: added.length, repeats: rows.length - added.length };
  });
}

/** Undo one import: the trades it added leave the track record (only the journal changes). */
export async function deleteHistoryImport(id: string) {
  await assertSession();
  return safely(async () => {
    const importId = HistImportId.parse(id);
    const sql = await db();
    const gone = await sql`delete from bot_history where import_id = ${importId} returning id`;
    await sql`delete from bot_history_imports where id = ${importId}`;
    done();
    return { ok: true as const, removed: gone.length };
  });
}

// ── Dry-run check ───────────────────────────────────────────────────────────

/** Compares every card's decisions (dry run and live) with an expected-trades file. Reads only; changes nothing. */
export async function checkExpected(csvText: string) {
  await assertSession();
  return safely(async () => {
    const [{ parseCsv }, { compareDryRun, parseExpected, tradingDay }] = await Promise.all([import("../import/csv"), import("../bot/drycheck")]);
    if (csvText.length > 2_000_000) return { error: "That file is too big." };
    const parsed = parseExpected(parseCsv(z.string().parse(csvText)));
    if (parsed.error) return { error: parsed.error };
    const sql = await db();
    const [cards, rows, signals] = await Promise.all([
      sql<{ id: string; label: string; phase: string }[]>`select id, label, phase from bot_accounts order by created_at`,
      sql<{ account_id: string; status: string; session: string; dir: string; stop_price: number; target_price: number | null; entered_at: Date; step: number | null; reason: string | null }[]>`
        select account_id, status, session, dir, stop_price, target_price, entered_at, step, reason from bot_trades where tv_id is not null and account_id is not null order by entered_at
      `,
      sql<{ received_at: Date }[]>`select received_at from bot_signals where event = 'signal'`,
    ]);
    const days = new Set(signals.map((s) => tradingDay(s.received_at.toISOString())));
    const result = compareDryRun(
      parsed.rows,
      rows.map((r) => ({ cardId: r.account_id, status: r.status, session: r.session, dir: r.dir, stop: r.stop_price, target: r.target_price, enteredAt: r.entered_at.toISOString(), step: r.step, reason: r.reason })),
      cards.map((c) => ({ id: c.id, label: c.label, phase: c.phase === "funded" ? ("funded" as const) : ("eval" as const) })),
      days,
    );
    const first = parsed.rows[0]?.day ?? null;
    const last = parsed.rows.at(-1)?.day ?? null;
    return { ok: true as const, file: { rows: parsed.rows.length, first, last }, signalDays: [...days].filter((d) => (!first || d >= first) && (!last || d <= last)).length, cards: result };
  });
}

/** Strategy health: send the PF60 warning as a test (changes nothing) so you can see it reach your phone. */
export async function healthTest() {
  await assertSession();
  return safely(async () => {
    const [{ checkHealth }, { botNotify }, { pfFmt }] = await Promise.all([import("../bot/healthCheck"), import("../bot/notify"), import("../bot/health")]);
    const h = await checkHealth();
    await botNotify(`🧪 TEST · ⚠️ S1 health: PF60 = 0.95 (below 1.0). Strategy may have stopped working.\nThis is only a test: the real PF60 is ${pfFmt(h.pf60)}. Nothing was changed.`, { push: true, telegram: false, critical: true, always: true, url: "/autopilot" });
    await logEvent("info", "Strategy health test alert sent");
    return { ok: true };
  });
}

/** Eval spend limit: a set of 5 failed (none passed). 2 in a row: warning + push. Never blocks anything. */
export async function evalSetFailed() {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    const [r] = await sql<{ failed_sets: number }[]>`update bot_health set failed_sets = failed_sets + 1 where id = 1 returning failed_sets`;
    const n = r?.failed_sets ?? 0;
    const { SPEND_LIMIT_SETS } = await import("../bot/health");
    if (n >= SPEND_LIMIT_SETS) {
      const { botNotify } = await import("../bot/notify");
      const text = `🛑 Eval spend limit: ${n} sets of evals failed in a row\nStop buying evals until you've looked at why. Reset it on Autopilot when you're ready.`;
      await logEvent("error", text.split("\n")[0]!);
      await botNotify(text, { push: true, telegram: false, critical: true, always: true, url: "/autopilot" });
      await sql`update bot_health set limit_warned_at = now() where id = 1`;
    } else await logEvent("warn", `Eval set failed (${n} in a row)`);
    done();
    return { ok: true, failedSets: n };
  });
}

/** Only you reset the spend limit (or record a set that passed). */
export async function evalSetsReset() {
  await assertSession();
  return safely(async () => {
    const sql = await db();
    await sql`update bot_health set failed_sets = 0, limit_warned_at = null where id = 1`;
    await logEvent("info", "Eval spend limit reset");
    done();
    return { ok: true };
  });
}
