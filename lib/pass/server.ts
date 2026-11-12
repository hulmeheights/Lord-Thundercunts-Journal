import { db } from "../db";
import { randomToken } from "../crypto";
import { zonedToUtc } from "../analytics/time";
import { logEvent } from "../bot/engine";
import { botNotify } from "../bot/notify";
import { accountDone, accountStats, money, passTradingDay, plan, SESSION_NAME, SESSION_TIMES, stageRules, type Card, type Firm, type PassSession, type Script, type Signal, type Stage, type Stats } from "./rules";

const NY = "America/New_York";
export type PassMode = "live" | "dry" | "signal";

export type PassAccountRow = {
  id: string;
  label: string;
  firm: Firm;
  stage: Stage;
  script: Script;
  topstep_account: string | null;
  contracts: number;
  dll: boolean;
  enabled: boolean;
  dry_run: boolean;
  base_profit: number;
  base_best: number;
  base_win_days: number;
  done: string | null;
  done_note: string | null;
  created_at: Date;
};

/** Topstep cards place orders from your Mac (or follow on practice); Lucid cards tell you the trade to place yourself. */
export const modeOf = (a: Pick<PassAccountRow, "firm" | "dry_run">): PassMode => (a.firm === "lucid" ? "signal" : a.dry_run ? "dry" : "live");
const toCard = (a: PassAccountRow): Card => ({ firm: a.firm, stage: a.stage, script: a.script, dll: a.dll, contracts: a.contracts });

/** Each account's stats from its own book (closed trades, any mode, since the card's stage last changed). */
export async function statsFor(a: PassAccountRow, now = new Date()): Promise<Stats> {
  const sql = await db();
  const rows = await sql<{ trading_day: string; pnl: number }[]>`
    select trading_day, pnl from pass_trades where account_id = ${a.id} and status = 'closed' and pnl is not null and stage = ${a.stage}
  `;
  return accountStats(
    rows.map((r) => ({ day: r.trading_day, pnl: r.pnl })),
    passTradingDay(now),
    { profit: a.base_profit, best: a.base_best, winDays: a.base_win_days },
    stageRules(a.firm, a.stage, a.dll),
  );
}

/** When a session's trade must be out (its time exit), as an instant. */
export function exitAt(session: PassSession, tradingDay: string): Date {
  const [h, m] = SESSION_TIMES[session].exit.split(":").map(Number);
  return zonedToUtc(tradingDay, h! * 60 + m!, NY);
}

/** Seconds until the next pass event (an entry or a time exit), so the Mac is awake for it. */
export function passWaitSeconds(now = new Date()): number {
  const ny = new Intl.DateTimeFormat("en-GB", { timeZone: NY, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => Number(ny.find((p) => p.type === t)!.value);
  const s = g("hour") * 3600 + g("minute") * 60 + g("second");
  const events = Object.values(SESSION_TIMES).flatMap((t) => [t.signal, t.exit]).map((x) => {
    const [h, m] = x.split(":").map(Number);
    return h! * 3600 + m! * 60 + 3;
  });
  return Math.min(...events.map((e) => (e - s + 86_400) % 86_400));
}

/** What the Mac needs for the pass plan: is it on, the accounts it may touch, and the trades it's following. */
export async function passContext() {
  const sql = await db();
  const [s] = await sql<{ mode: string }[]>`select mode from pass_settings where id = 1`;
  const cards = await sql<PassAccountRow[]>`select * from pass_accounts order by created_at`;
  const open = await sql<{ id: string; account_id: string | null; mode: PassMode; session: PassSession; trading_day: string; dir: string; qty: number; entry_price: number; stop_price: number; target_price: number; entered_at: Date; order_id: string | null }[]>`
    select id, account_id, mode, session, trading_day, dir, qty, entry_price, stop_price, target_price, entered_at, order_id from pass_trades where status = 'open'
  `;
  const byId = new Map(cards.map((c) => [c.id, c]));
  return {
    on: s?.mode === "on" && cards.some((c) => c.enabled),
    accounts: cards.filter((c) => c.enabled && modeOf(c) === "live").map((c) => ({ cardId: c.id, label: c.label, account: c.topstep_account })),
    open: open.map((t) => ({
      id: t.id,
      cardId: t.account_id,
      label: (t.account_id && byId.get(t.account_id)?.label) || "",
      account: (t.account_id && byId.get(t.account_id)?.topstep_account) || null,
      mode: t.mode,
      session: t.session,
      dir: t.dir,
      qty: t.qty,
      entry: t.entry_price,
      stop: t.stop_price,
      target: t.target_price,
      enteredAt: t.entered_at.toISOString(),
      exitAt: exitAt(t.session, t.trading_day).toISOString(),
      orderId: t.order_id,
    })),
  };
}

const r2 = (x: number) => Math.round(x / 0.25) * 0.25;
const clock = (session: PassSession) => `${SESSION_TIMES[session].exit} New York`;

/**
 * A session's signal from your Mac (measured on the 1-minute bars): every
 * switched-on account decides, the decision is written down (one per account,
 * session and day, so nothing doubles), and the Mac gets the orders to place.
 */
export async function passSignal(sig: Signal & { barTime: string }) {
  const sql = await db();
  const [s] = await sql<{ mode: string }[]>`select mode from pass_settings where id = 1`;
  if (s?.mode !== "on") return { plans: [] };
  const cards = await sql<PassAccountRow[]>`select * from pass_accounts where enabled order by created_at`;
  const head = `${SESSION_NAME[sig.session]} ${sig.dir} @ ${sig.price} · 4H ${sig.bias ?? "flat"} · value area ${sig.val ?? "?"}–${sig.vah ?? "?"}`;
  const plans: { tradeId: string; cardId: string; label: string; account: string | null; mode: PassMode; dir: string; qty: number; stopTicks: number; targetTicks: number }[] = [];
  const lines: string[] = [];
  for (const a of cards) {
    const st = await statsFor(a);
    const p = plan(toCard(a), st, sig);
    const mode = modeOf(a);
    const id = `pt_${randomToken(10)}`;
    const long = sig.dir === "LONG" ? 1 : -1;
    const stop = p.take ? r2(sig.price - long * p.stopPts) : sig.price;
    const target = p.take ? r2(sig.price + long * p.targetPts) : sig.price;
    const ins = await sql`
      insert into pass_trades (id, account_id, account_label, mode, stage, session, trading_day, dir, qty, entry_price, stop_price, target_price, status, reason, filters, entered_at)
      values (${id}, ${a.id}, ${a.label}, ${mode}, ${a.stage}, ${sig.session}, ${sig.tradingDay}, ${sig.dir}, ${a.contracts}, ${sig.price}, ${stop}, ${target},
        ${p.take ? "pending" : "skipped"}, ${p.reason}, ${sql.json({ bias: sig.bias, vah: sig.vah, val: sig.val, barTime: sig.barTime } as never)}, now())
      on conflict (account_id, trading_day, session) do nothing returning id
    `;
    if (!ins.length) continue; // already decided for this session
    lines.push(`• ${a.label}: ${p.take ? `${mode === "live" ? "placing" : mode === "dry" ? "practice" : "YOURS TO PLACE"} · SL ${stop} · TP ${target}` : `skip (${p.reason})`}`);
    if (!p.take) continue;
    if (mode === "signal") {
      await botNotify(`📣 ${a.label}: ${sig.dir} ${a.contracts} MNQ now\nPass plan · ${SESSION_NAME[sig.session]} · @ ~${sig.price} · stop ${stop} · target ${target} · close it at ${clock(sig.session)} if neither is hit`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
    }
    plans.push({ tradeId: id, cardId: a.id, label: a.label, account: a.topstep_account, mode, dir: sig.dir, qty: a.contracts, stopTicks: p.stopTicks, targetTicks: p.targetTicks });
  }
  await logEvent("info", `Pass plan · ${head}: ${plans.length} to take`);
  if (lines.length) await sql`insert into bot_events (level, message) values ('info', ${`Pass plan · ${head}\n${lines.join("\n")}`.slice(0, 1900)})`;
  return { plans };
}

/** The Mac's result for each order it was given. */
export async function passResults(results: { tradeId: string; status: "open" | "error"; orderId?: string | null; fill?: number | null; reason?: string | null }[]) {
  const sql = await db();
  for (const r of results) {
    const [t] = await sql<{ account_label: string; mode: PassMode; dir: string; qty: number; entry_price: number; stop_price: number; target_price: number; session: PassSession }[]>`
      select account_label, mode, dir, qty, entry_price, stop_price, target_price, session from pass_trades where id = ${r.tradeId} and status = 'pending'
    `;
    if (!t) continue;
    if (r.status === "error") {
      await sql`update pass_trades set status = 'error', reason = ${(r.reason ?? "rejected").slice(0, 400)} where id = ${r.tradeId}`;
      await logEvent("error", `Pass plan: order failed on ${t.account_label}: ${r.reason ?? "rejected"}`);
      await botNotify(`⚠ Pass plan order failed · ${t.account_label}\n${r.reason ?? "rejected"}`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
      continue;
    }
    // Keep the stop and target at the same distance from the real fill (that's how the bracket sits at Topstep).
    const fill = r.fill && r.fill > 0 ? r.fill : t.entry_price;
    const shift = fill - t.entry_price;
    await sql`
      update pass_trades set status = 'open', order_id = ${r.orderId ?? null}, entry_price = ${fill}, stop_price = ${t.stop_price + shift}, target_price = ${t.target_price + shift}, entered_at = now()
      where id = ${r.tradeId}
    `;
    if (t.mode === "live") await botNotify(`Pass plan · ${t.dir} ${t.qty} MNQ on ${t.account_label}\n${SESSION_NAME[t.session]} · in @ ${fill} · SL ${t.stop_price + shift} · TP ${t.target_price + shift}`, { push: true, telegram: false, always: true, url: "/pass" });
  }
}

/** A pass trade closed (stop, target or time exit): book it, then check the account (passed, payout, blown). */
export async function passClosed(r: { tradeId: string; exitPrice: number | null; pnl: number; fees: number; reason: "target" | "stop" | "time" | "other"; exitedAt: string }) {
  const sql = await db();
  const [t] = await sql<{ account_id: string | null; account_label: string; mode: PassMode; dir: string; session: PassSession }[]>`
    update pass_trades set status = 'closed', exit_price = ${r.exitPrice}, pnl = ${Math.round(r.pnl * 100) / 100}, fees = ${r.fees}, exit_reason = ${r.reason}, exited_at = ${new Date(r.exitedAt)}
    where id = ${r.tradeId} and status = 'open' returning account_id, account_label, mode, dir, session
  `;
  if (!t) return;
  const how = r.reason === "time" ? "time exit" : r.reason;
  await logEvent("info", `Pass plan closed · ${t.account_label}: ${money(r.pnl)} (${how}${r.exitPrice ? ` @ ${r.exitPrice}` : ""})`);
  const lucidTimeExit = t.mode === "signal" && r.reason === "time";
  await botNotify(
    lucidTimeExit
      ? `⏰ ${t.account_label}: close your ${t.dir} now\nPass plan · ${SESSION_NAME[t.session]} time exit (${SESSION_TIMES[t.session].exit} New York)`
      : `Pass plan closed · ${money(r.pnl)}\n${t.account_label}${t.mode === "live" ? "" : t.mode === "dry" ? " (practice)" : " (yours)"} · ${how}`,
    { push: t.mode !== "dry", telegram: false, critical: lucidTimeExit, always: true, url: "/pass" },
  );
  if (t.mode === "live") await import("../data/botCopies").then((m) => m.hideBotCopies()).catch(() => 0);
  if (!t.account_id) return;
  const [a] = await sql<PassAccountRow[]>`select * from pass_accounts where id = ${t.account_id}`;
  if (!a) return;
  const done = accountDone(a.stage, stageRules(a.firm, a.stage, a.dll), await statsFor(a));
  if (!done) return;
  const off = await sql`update pass_accounts set enabled = false, done = ${done.kind}, done_note = ${done.text} where id = ${a.id} and done is distinct from ${done.kind} returning id`;
  if (!off.length) return;
  const next =
    done.kind === "passed"
      ? a.firm === "lucid" && a.stage === "eval"
        ? "Set this card to Pre-live when Lucid moves you on, then switch it back on."
        : "When the funded account arrives, set this card to Funded with its new account and switch it on."
      : done.kind === "payout"
        ? "Request your payout."
        : "This account is finished.";
  await logEvent(done.kind === "blown" ? "error" : "info", `Pass plan · ${a.label}: ${done.text}. Switched off.`);
  await botNotify(`${done.kind === "blown" ? "💥" : "🏁"} ${a.label}: ${done.kind === "blown" ? "blown" : done.kind === "payout" ? "payout ready" : "passed"}\n${done.text}. Switched off. ${next}`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
}

export { passTradingDay };
