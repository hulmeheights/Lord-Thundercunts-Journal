import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { claimAlerts, napSeconds, runnerAuthed } from "@/lib/bot/runner";
import { dayPnl, logEvent, money, switchOff, toAccount, type AccountRow } from "@/lib/bot/engine";
import { botNotify } from "@/lib/bot/notify";
import { newsAround } from "@/lib/bot/newsFeed";
import { SESSION_LABEL, type Session } from "@/lib/bot/signal";

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
  return {
    mode: s?.mode ?? "off",
    newsMinutes: s?.news_minutes ?? 0,
    news,
    balancesDue: !!s?.balances_due,
    cards: cards.map((c) => ({ ...c, dayPnl: day.get(c.id) ?? 0 })),
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
  if (nap > 0) return NextResponse.json({ alerts: [], wait: nap, context: await context() });
  const [{ mode }] = await sql<{ mode: string }[]>`select mode from bot_settings where id = 1`;
  if (mode !== "live") return NextResponse.json({ alerts: [], wait: 20, context: await context() });
  for (let waited = 0; waited < 20_000; waited += 400) {
    const alerts = await claimAlerts();
    if (alerts.length) return NextResponse.json({ alerts, wait: 0, context: await context() });
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
  qty: z.number().int().min(1).max(50),
});
const Passed = z.object({ cardId: z.string().max(60), profit: z.number() });
const Report = z.discriminatedUnion("type", [
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
  for (const p of r.passed) {
    const c = cards.get(p.cardId);
    if (c) await switchOff(c, p.profit);
  }
  if (r.type === "accounts") {
    await sql`update bot_runner set accounts = ${sql.json(r.accounts as never)}, accounts_at = now() where id = 1`;
    for (const b of r.balances) await sql`update bot_accounts set last_balance = ${b.balance}, balance_at = now() where id = ${b.cardId}`;
    await sql`update bot_settings set balances_due = null where id = 1`;
    return NextResponse.json({ ok: true });
  }
  const [sig] = await sql<{ id: string; dir: "LONG" | "SHORT"; price: number; stop: number; target: number; session: Session; received_at: Date }[]>`
    update bot_signals set handoff = 'done' where id = ${r.signalId} returning id, dir, price, stop, target, session, received_at
  `;
  if (!sig) return NextResponse.json({ error: "unknown signal" }, { status: 404 });
  const lines: string[] = [];
  for (const x of r.results) {
    const label = cards.get(x.cardId)?.label ?? "account";
    await sql`
      insert into bot_trades (id, signal_id, account_id, account_label, mode, session, dir, qty, entry_price, stop_price, target_price, status, reason, order_id, entered_at)
      values (${`bt_${randomToken(10)}`}, ${sig.id}, ${cards.has(x.cardId) ? x.cardId : null}, ${label}, 'live', ${sig.session}, ${sig.dir}, ${x.qty}, ${sig.price}, ${sig.stop}, ${sig.target}, ${x.status}, ${x.reason ?? null}, ${x.orderId ?? null}, ${sig.received_at})
    `;
    lines.push(x.status === "open" ? `• ${label}: ${x.qty} MNQ ✓` : `• ${label}: ${x.status === "error" ? "FAILED" : "skipped"} (${x.reason ?? "no reason"})`);
    if (x.status === "error") await logEvent("error", `Order failed on ${label} (from your Mac): ${x.reason ?? "unknown"}`);
  }
  const head = `${sig.dir} ${SESSION_LABEL[sig.session]} @ ~${sig.price} · SL ${sig.stop} · TP ${sig.target}`;
  await logEvent("info", `Your Mac handled ${head}: ${r.results.filter((x) => x.status === "open").length} placed`);
  const placed = r.results.filter((x) => x.status === "open").length;
  const failed = r.results.filter((x) => x.status === "error").length;
  await botNotify(`${placed ? `Trade placed · ${head}` : `Not placed · ${head}`}${failed ? " (some failed)" : ""}\n${lines.join("\n") || "• no accounts switched on"}`, { push: placed > 0 });
  return NextResponse.json({ ok: true });
}
