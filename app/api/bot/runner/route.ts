import { after, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { claimAlerts, napSeconds, runnerAuthed } from "@/lib/bot/runner";
import { dayPnl, handleSignal, logEvent, money, switchOff, toAccount, type AccountRow } from "@/lib/bot/engine";
import { botNotify } from "@/lib/bot/notify";
import { newsAround } from "@/lib/bot/newsFeed";
import { SESSION_LABEL, type BotAccount, type Session } from "@/lib/bot/signal";
import { barTimeOf } from "@/lib/bot/sor";
import { passClosed, passContext, passListening, passResults, passWaitSeconds } from "@/lib/pass/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Your settings, as the Mac needs them to decide: the journal decides nothing in Live. */
async function context() {
  const sql = await db();
  const [s] = await sql<{ mode: string; news_minutes: number; balances_due: Date | null }[]>`select mode, news_minutes, balances_due from bot_settings where id = 1`;
  const cards = (await sql<AccountRow[]>`select * from bot_accounts where enabled order by created_at`).map(toAccount);
  const day = await dayPnl("live");
  const around = (s?.news_minutes ?? 0) + 5;
  const news = await newsAround(new Date(Date.now() - around * 60_000), new Date(Date.now() + around * 60_000));
  // SOR v2: each card's own ledger for the last 9 days (its book: dry run or live), so the Mac rebuilds
  // today's trades, session counts and losing days from records, never from memory.
  const paper = s?.mode === "paper";
  const rows = await sql<{ id: string; account_id: string; mode: string; session: string; status: string; pnl: number | null; entered_at: Date; exited_at: Date | null; dir: string; qty: number; entry_price: number; stop_price: number; target_price: number | null; bar_time: Date | null; order_id: string | null }[]>`
    select id, account_id, mode, session, status, pnl, entered_at, exited_at, dir, qty, entry_price, stop_price, target_price, bar_time, order_id from bot_trades
    where mode in ('live', 'dry') and status in ('open', 'closed') and account_id is not null and (entered_at > now() - interval '9 days' or status = 'open')
    order by entered_at
  `;
  const dryOf = (c: (typeof cards)[number]) => paper || c.dryRun !== false;
  // Open trades are watched even if their card has since been switched off.
  const every = await sql<{ id: string; label: string; topstep_account: string | null }[]>`select id, label, topstep_account from bot_accounts`;
  const hints = new Map(every.map((a) => [a.id, a.topstep_account]));
  const labels = new Map(every.map((a) => [a.id, a.label]));
  return {
    // The pass plan (scripts C/D): its own switch, accounts and open trades; the Mac measures and places, the journal decides.
    pass: await passContext(),
    mode: s?.mode ?? "off",
    newsMinutes: s?.news_minutes ?? 0,
    news,
    balancesDue: !!s?.balances_due,
    cards: cards.map((c) => {
      const dry = dryOf(c);
      return {
        ...c,
        dayPnl: day.get(c.id) ?? 0,
        dry,
        ledger: rows.filter((t) => t.account_id === c.id && t.mode === (dry ? "dry" : "live")).map((t) => ({ enteredAt: t.entered_at.toISOString(), exitedAt: t.exited_at?.toISOString() ?? null, session: t.session, status: t.status, pnl: t.pnl })),
      };
    }),
    // Trades still open (any card, either book): the Mac watches them close, cleans up, and reports the result.
    openTrades: rows
      .filter((t) => t.status === "open")
      .map((t) => ({ id: t.id, cardId: t.account_id, account: hints.get(t.account_id) ?? null, label: labels.get(t.account_id) ?? "", dry: t.mode === "dry", dir: t.dir, qty: t.qty, entry: t.entry_price, stop: t.stop_price, target: t.target_price, barTime: t.bar_time?.toISOString() ?? null, enteredAt: t.entered_at.toISOString(), orderId: t.order_id })),
  };
}

/**
 * The Mac asks here. Outside the sessions it's told to nap until shortly before
 * the next one; inside, while Autopilot is live, the line is held open for up to
 * 20 seconds so an alert reaches it within half a second, with your settings.
 */
export async function GET(req: Request) {
  const nap = napSeconds(new Date());
  if (!(await runnerAuthed(req.headers.get("authorization")))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const sql = await db();
  // Headers are plain ASCII: anything else (e.g. a "·" from an older Mac program) becomes " - ".
  const info = (req.headers.get("x-runner") ?? "").replace(/[^\x20-\x7e]+/g, " - ").replace(/\s+/g, " ").trim().slice(0, 120) || null;
  await sql`update bot_runner set last_seen = now(), info = coalesce(${info}, info) where id = 1`;
  // Awake for every pass-plan entry and time exit; every 8 seconds while a real pass trade is open (the goal guard
  // watches its target), every 30 while only practice ones are.
  const passWait = (ctx: Awaited<ReturnType<typeof context>>, w: number) =>
    Math.max(0, Math.min(w, ctx.pass.open.some((t) => t.mode === "live") ? 8 : ctx.pass.open.length ? 30 : Infinity, ctx.pass.on || ctx.pass.open.length ? passWaitSeconds() : Infinity));
  // SOR signals come at any minute of London's and NY AM's windows: while a real card trades SOR, the line is held open for them.
  const listening = await passListening();
  if (nap > 0 && !listening) {
    const ctx = await context();
    // A trade still open outside a session: keep checking every 30 seconds so its close is caught and cleaned up.
    return NextResponse.json({ alerts: [], wait: passWait(ctx, ctx.openTrades.length ? Math.min(nap, 30) : nap), context: ctx });
  }
  const [{ mode }] = await sql<{ mode: string }[]>`select mode from bot_settings where id = 1`;
  const autopilot = nap === 0 && (mode === "live" || mode === "paper");
  if (!autopilot && !listening) {
    const ctx = await context();
    return NextResponse.json({ alerts: [], wait: passWait(ctx, 20), context: ctx });
  }
  // A real pass trade open: come back sooner, so the goal guard looks at it every few seconds.
  const [lp] = await sql<{ n: number }[]>`select count(*)::int as n from pass_trades where status = 'open' and mode = 'live'`;
  const hold = lp?.n ? 6_000 : 20_000;
  for (let waited = 0; waited < hold; waited += 400) {
    const alerts = autopilot ? await claimAlerts() : [];
    if (alerts.length) return NextResponse.json({ alerts, wait: 0, context: await context() });
    const [pp] = await sql<{ n: number }[]>`select count(*)::int as n from pass_trades where status = 'pending' and claimed_at is null`;
    if (pp?.n) return NextResponse.json({ alerts: [], wait: 0, context: await context() });
    if (waited === 0) {
      const [b] = await sql<{ balances_due: Date | null }[]>`select balances_due from bot_settings where id = 1`;
      if (b?.balances_due) return NextResponse.json({ alerts: [], wait: 0, context: await context() });
    }
    await sleep(400);
  }
  await sql`update bot_runner set last_seen = now() where id = 1`;
  return NextResponse.json({ alerts: [], wait: 0, context: await context() });
}

const Result = z.object({
  cardId: z.string().max(60),
  status: z.enum(["open", "skipped", "error"]),
  reason: z.string().max(500).nullish(),
  orderId: z.string().max(40).nullish(),
  /** The real fill price at Topstep (bot 2.2+), so the book's P&L starts from where you actually got in. */
  fill: z.number().finite().positive().nullish(),
  qty: z.number().int().min(1).max(50),
  /** SOR v2: the step a skip failed at (1-12, or 13 for the bot's own safety checks), the target used, dry run. */
  step: z.number().int().min(0).max(20).nullish(),
  target: z.number().finite().positive().nullish(),
  capped: z.boolean().nullish(),
  dry: z.boolean().nullish(),
  phase: z.enum(["eval", "funded"]).nullish(),
});
const Closed = z.object({
  type: z.literal("closed"),
  tradeId: z.string().regex(/^bt_[A-Za-z0-9_-]{6,40}$/),
  exitPrice: z.number().finite().positive().nullable(),
  pnl: z.number().finite(),
  fees: z.number().finite().min(0).default(0),
  reason: z.enum(["target", "stop", "other"]),
  exitedAt: z.string().datetime({ offset: true }),
});
const Passed = z.object({ cardId: z.string().max(60), profit: z.number() });
const TestSignal = z.object({
  type: z.literal("test"),
  dir: z.enum(["LONG", "SHORT"]),
  entry: z.number().finite().positive(),
  stop: z.number().finite().positive(),
  target: z.number().finite().positive(),
});
const Ready = z.object({ type: z.literal("ready"), problems: z.array(z.string().max(300)).max(20), summary: z.string().max(400) });
const PassResults = z.object({
  type: z.literal("pass_results"),
  results: z
    .array(
      z.object({
        tradeId: z.string().regex(/^pt_[A-Za-z0-9_-]{6,40}$/),
        status: z.enum(["open", "error"]),
        orderId: z.string().max(40).nullish(),
        fill: z.number().finite().positive().nullish(),
        /** Where the stop and target really sit at Topstep after the fill (bot 5.0+). */
        stop: z.number().finite().positive().nullish(),
        target: z.number().finite().positive().nullish(),
        reason: z.string().max(500).nullish(),
      }),
    )
    .max(50),
});
/** The goal guard moved or re-made a bracket order, or found something it couldn't fix: logged, and pushed when it matters. */
const PassNote = z.object({ type: z.literal("pass_note"), tradeId: z.string().regex(/^pt_[A-Za-z0-9_-]{6,40}$/), level: z.enum(["info", "warn", "error"]), message: z.string().max(400) });
const PassClosed = z.object({
  type: z.literal("pass_closed"),
  tradeId: z.string().regex(/^pt_[A-Za-z0-9_-]{6,40}$/),
  exitPrice: z.number().finite().positive().nullable(),
  pnl: z.number().finite(),
  fees: z.number().finite().min(0).default(0),
  reason: z.enum(["target", "stop", "time", "goal", "other"]),
  exitedAt: z.string().datetime({ offset: true }),
});
const Report = z.discriminatedUnion("type", [
  PassResults,
  PassNote,
  PassClosed,
  Closed,
  Ready,
  TestSignal,
  z.object({ type: z.literal("results"), signalId: z.string().regex(/^sig_[a-f0-9]{24}$/), results: z.array(Result).max(50), passed: z.array(Passed).max(50).default([]) }),
  z.object({
    type: z.literal("accounts"),
    accounts: z.array(z.object({ id: z.number().int(), name: z.string().max(120), balance: z.number().nullable(), canTrade: z.boolean() })).max(200),
    balances: z.array(z.object({ cardId: z.string().max(60), balance: z.number() })).max(50).default([]),
    passed: z.array(Passed).max(50).default([]),
  }),
]);

/** The Mac reports what it did with an alert (per card), or your accounts and balances (for display and targets). */
export async function POST(req: Request) {
  if (!(await runnerAuthed(req.headers.get("authorization")))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const parsed = Report.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad report" }, { status: 400 });
  const r = parsed.data;
  const sql = await db();
  const cards = new Map((await sql<AccountRow[]>`select * from bot_accounts`).map((c) => [c.id, toAccount(c)]));
  for (const p of "passed" in r ? r.passed : []) {
    const c = cards.get(p.cardId);
    if (c) await switchOff(c, p.profit);
  }
  if (r.type === "pass_results") {
    await passResults(r.results);
    return NextResponse.json({ ok: true });
  }
  if (r.type === "pass_note") {
    const [t] = await sql<{ account_label: string }[]>`select account_label from pass_trades where id = ${r.tradeId}`;
    const message = `Pass plan · ${t?.account_label ?? "account"}: ${r.message}`;
    const [recent] = await sql<{ n: number }[]>`select count(*)::int as n from bot_events where message = ${message} and created_at > now() - interval '10 minutes'`;
    if (!recent?.n) {
      await logEvent(r.level, message);
      if (r.level === "error") await botNotify(`⚠ Pass plan · ${t?.account_label ?? "account"}\n${r.message}`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
    }
    return NextResponse.json({ ok: true });
  }
  if (r.type === "pass_closed") {
    await passClosed(r);
    return NextResponse.json({ ok: true });
  }
  if (r.type === "ready") {
    // The Mac checks itself as each session starts. All good: one quiet log line. Anything wrong: log + push, at most every 3 hours per problem.
    if (!r.problems.length) {
      await logEvent("info", `Ready for the session: ${r.summary}`);
      return NextResponse.json({ ok: true });
    }
    for (const p of r.problems) {
      const message = `Not ready for the session: ${p}`;
      const [recent] = await sql<{ n: number }[]>`select count(*)::int as n from bot_events where message = ${message} and created_at > now() - interval '3 hours'`;
      if (recent?.n) continue;
      await logEvent("error", message);
      await botNotify(`⚠ Autopilot isn't ready for the session\n${p}`, { push: true, critical: true });
    }
    return NextResponse.json({ ok: true });
  }
  if (r.type === "test") {
    // "python3 autopilot-runner.py test": one signal for each signal set (3/3 eval, 3/2 funded), passing every
    // time and session rule, so the cards decide on it exactly as on a real one. Only cards on Real orders place.
    const now = new Date();
    const dow = new Date(now.getTime() + 6 * 3600_000).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" });
    for (const swing of ["3/3", "3/2"] as const) {
      const sig = {
        secret: "",
        event: "signal" as const,
        swing,
        session: "NYAM" as const,
        dow: (["Mon", "Tue", "Wed", "Fri"].includes(dow) ? dow : "Fri") as "Mon" | "Tue" | "Wed" | "Fri",
        mins_in: 10,
        quiet: false,
        dir: r.dir,
        entry: r.entry,
        stop: r.stop,
        target: r.target,
        quiet_target: null,
        atr: null,
        id: `${now.getTime()}-${swing}-TEST`,
      };
      after(() => handleSignal(sig, now).catch(() => {}));
    }
    await logEvent("warn", `Test signal from your Mac: ${r.dir} @ ${r.entry} · SL ${r.stop} · TP ${r.target} (one for eval, one for funded)`);
    return NextResponse.json({ ok: true });
  }
  if (r.type === "closed") {
    const [t] = await sql<{ account_label: string; mode: string; dir: string; session: string; qty: number }[]>`
      update bot_trades set status = 'closed', exit_price = ${r.exitPrice}, pnl = ${Math.round(r.pnl * 100) / 100}, fees = ${r.fees}, exit_reason = ${r.reason}, exited_at = ${new Date(r.exitedAt)}
      where id = ${r.tradeId} and status = 'open' returning account_label, mode, dir, session, qty
    `;
    if (!t) return NextResponse.json({ ok: true, already: true });
    const dry = t.mode === "dry";
    const line = `${t.dir} ${t.session} · ${t.account_label}: ${money(r.pnl)} (${r.reason === "target" ? "target" : r.reason === "stop" ? "stop" : "closed"}${r.exitPrice ? ` @ ${r.exitPrice}` : ""})`;
    await logEvent("info", `${dry ? "Dry run closed" : "Trade closed"}: ${line}`);
    await botNotify(`${dry ? "Dry run closed" : "Trade closed"} · ${money(r.pnl)}\n${line}`, { push: !dry });
    if (!dry) await sql`update bot_settings set balances_due = now() where id = 1`;
    if (!dry) after(() => import("@/lib/data/botCopies").then((m) => m.hideBotCopies()).catch(() => {}));
    // Strategy health (PF60) after every close, dry run or real. Tracking only: never stops a trade.
    after(() => import("@/lib/bot/healthCheck").then((m) => m.checkHealth()).catch(() => {}));
    return NextResponse.json({ ok: true });
  }
  if (r.type === "accounts") {
    await sql`update bot_runner set accounts = ${sql.json(r.accounts as never)}, accounts_at = now() where id = 1`;
    for (const b of r.balances) await sql`update bot_accounts set last_balance = ${b.balance}, balance_at = now() where id = ${b.cardId}`;
    await sql`update bot_settings set balances_due = null where id = 1`;
    return NextResponse.json({ ok: true });
  }
  const [sig] = await sql<{ id: string; event: string; dir: "LONG" | "SHORT"; price: number; stop: number; target: number | null; session: Session; received_at: Date; tv_id: string | null; payload: { swing?: string; quiet?: boolean; id?: string; dow?: string; mins_in?: number } | null }[]>`
    update bot_signals set handoff = 'done' where id = ${r.signalId} returning id, event, dir, price, stop, target, session, received_at, tv_id, payload
  `;
  if (!sig) return NextResponse.json({ error: "unknown signal" }, { status: 404 });
  if (sig.event === "signal") return sorResults(sig, r.results, cards);
  const lines: string[] = [];
  for (const x of r.results) {
    const label = cards.get(x.cardId)?.label ?? "account";
    await sql`
      insert into bot_trades (id, signal_id, account_id, account_label, mode, session, dir, qty, entry_price, stop_price, target_price, status, reason, order_id, entered_at)
      values (${`bt_${randomToken(10)}`}, ${sig.id}, ${cards.has(x.cardId) ? x.cardId : null}, ${label}, 'live', ${sig.session}, ${sig.dir}, ${x.qty}, ${x.fill ?? sig.price}, ${sig.stop}, ${sig.target}, ${x.status}, ${x.reason ?? null}, ${x.orderId ?? null}, ${sig.received_at})
    `;
    lines.push(x.status === "open" ? `• ${label}: ${x.qty} MNQ ✓` : `• ${label}: ${x.status === "error" ? "FAILED" : "skipped"} (${x.reason ?? "no reason"})`);
    if (x.status === "error") await logEvent("error", `Order failed on ${label} (from your Mac): ${x.reason ?? "unknown"}`);
  }
  const head = `${sig.dir} ${SESSION_LABEL[sig.session]} @ ~${sig.price} · SL ${sig.stop} · TP ${sig.target}`;
  await logEvent("info", `Your Mac handled ${head}: ${r.results.filter((x) => x.status === "open").length} placed`);
  const placed = r.results.filter((x) => x.status === "open").length;
  const failed = r.results.filter((x) => x.status === "error").length;
  await botNotify(`${placed ? `Trade placed · ${head}` : `Not placed · ${head}`}${failed ? " (some failed)" : ""}\n${lines.join("\n") || "• no accounts switched on"}`);
  // A card that's switched on but couldn't place is the one thing (besides a close) worth a phone push.
  if (failed) {
    const why = r.results
      .filter((x) => x.status === "error")
      .map((x) => {
        const label = cards.get(x.cardId)?.label ?? "a card";
        const fix = /Auto OCO/i.test(x.reason ?? "") ? "turn on Auto OCO Brackets for this account in TopstepX settings" : (x.reason ?? "unknown").slice(0, 120);
        return `${label}: ${fix}`;
      })
      .join("\n");
    await botNotify(`⚠ Order failed on ${failed} ${failed === 1 ? "account" : "accounts"}\n${why}`, { push: true, telegram: false });
  }
  return NextResponse.json({ ok: true });
}

type SorSig = { id: string; dir: "LONG" | "SHORT"; price: number; stop: number; target: number | null; session: Session; received_at: Date; tv_id: string | null; payload: { swing?: string; quiet?: boolean; id?: string; dow?: string; mins_in?: number } | null };

/**
 * SOR v2: one ledger row per card for every signal: taken (live or dry run),
 * skipped with the step it failed at, or failed at Topstep (not counted as a
 * trade). Telegram once per order placed; skips go to the log only.
 */
async function sorResults(sig: SorSig, results: z.infer<typeof Result>[], cards: Map<string, BotAccount>) {
  const sql = await db();
  const p = sig.payload ?? {};
  const bar = sig.tv_id ? barTimeOf(sig.tv_id) : null;
  const head = `${p.swing ?? ""} ${sig.dir} ${SESSION_LABEL[sig.session]} ${p.dow ?? ""} +${p.mins_in ?? "?"}m${p.quiet ? " quiet" : ""} @ ${sig.price}`.replace(/\s+/g, " ").trim();
  const placed: string[] = [];
  const skipped: string[] = [];
  for (const x of results) {
    const card = cards.get(x.cardId);
    const label = card?.label ?? "account";
    const dry = x.dry ?? true;
    await sql`
      insert into bot_trades (id, signal_id, account_id, account_label, mode, session, dir, qty, entry_price, stop_price, target_price, status, reason, order_id, entered_at, tv_id, swing, phase, quiet, capped, step, bar_time)
      values (${`bt_${randomToken(10)}`}, ${sig.id}, ${card ? x.cardId : null}, ${label}, ${dry ? "dry" : "live"}, ${sig.session}, ${sig.dir}, ${x.qty}, ${x.fill ?? sig.price}, ${sig.stop}, ${x.target ?? sig.target}, ${x.status}, ${x.reason ?? null}, ${x.orderId ?? null}, ${sig.received_at},
              ${sig.tv_id}, ${p.swing ?? null}, ${x.phase ?? card?.phase ?? null}, ${p.quiet ?? null}, ${x.capped ?? null}, ${x.step ?? null}, ${bar})
    `;
    if (x.status === "open") placed.push(`• ${label}: ${x.qty} MNQ${dry ? " (dry run, no order)" : ""} · SL ${sig.stop} · TP ${x.target ?? sig.target}${x.capped ? " (capped)" : ""}`);
    else if (x.status === "error") {
      placed.push(`• ${label}: FAILED (${x.reason ?? "unknown"})`);
      await logEvent("error", `Order failed on ${label} (from your Mac): ${x.reason ?? "unknown"}`);
    } else skipped.push(`${label}: step ${x.step ?? "?"} (${x.reason ?? "no reason"})`);
  }
  await logEvent("info", `Signal ${sig.tv_id ?? ""} ${head}: ${results.filter((x) => x.status === "open").length} taken${skipped.length ? ` · skipped ${skipped.join("; ")}` : ""}`);
  if (placed.length) await botNotify(`Trade placed · ${head}\n${placed.join("\n")}`);
  const failed = results.filter((x) => x.status === "error");
  if (failed.length) {
    const why = failed.map((x) => `${cards.get(x.cardId)?.label ?? "a card"}: ${/Auto OCO/i.test(x.reason ?? "") ? "turn on Auto OCO Brackets for this account in TopstepX settings" : (x.reason ?? "unknown").slice(0, 120)}`).join("\n");
    await botNotify(`⚠ Order failed on ${failed.length} ${failed.length === 1 ? "account" : "accounts"}\n${why}`, { push: true, telegram: false });
  }
  return NextResponse.json({ ok: true });
}
