import { db } from "../db";
import { randomToken } from "../crypto";
import { zonedToUtc } from "../analytics/time";
import { logEvent } from "../bot/engine";
import { newsBlock } from "../bot/news";
import { newsAround } from "../bot/newsFeed";
import { botNotify } from "../bot/notify";
import { accountDone, accountStats, money, passTradingDay, plan, planSor, resolve, SESSION_NAME, SESSION_TIMES, SOR_EXIT, SOR_SESSIONS, sorValid, type AnySession, type Card, type Firm, type PassSession, type RawSor, type SavedSettings, type Script, type Signal, type Stage, type StageCfg, type Stats, type Strategy } from "./rules";

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
  /** What this card changed from the tested defaults, per stage. */
  settings: SavedSettings | null;
  /** After a payout the loss floor is $0 for good. */
  floor_locked: boolean;
  /** Only trades from here count (set when the stage changes or a payout is taken). */
  stats_from: Date | null;
  payouts: number;
};

/** Topstep cards place orders from your Mac (or follow on practice); Lucid cards tell you the trade to place yourself. */
export const modeOf = (a: Pick<PassAccountRow, "firm" | "dry_run">): PassMode => (a.firm === "lucid" ? "signal" : a.dry_run ? "dry" : "live");
export const cfgOf = (a: Pick<PassAccountRow, "firm" | "stage" | "dll" | "settings">): StageCfg => resolve(a.firm, a.stage, a.dll, a.settings);
const toCard = (a: PassAccountRow): Card => ({ firm: a.firm, stage: a.stage, cfg: cfgOf(a) });

/** Each account's stats from its own book (closed trades, any mode, since the card's stage last changed). */
export async function statsFor(a: PassAccountRow, now = new Date()): Promise<Stats> {
  const sql = await db();
  const rows = await sql<{ trading_day: string; pnl: number }[]>`
    select trading_day, pnl from pass_trades
    where account_id = ${a.id} and status = 'closed' and pnl is not null and stage = ${a.stage} and entered_at >= ${a.stats_from ?? new Date(0)}
  `;
  return accountStats(
    rows.map((r) => ({ day: r.trading_day, pnl: r.pnl })),
    passTradingDay(now),
    { profit: a.base_profit, best: a.base_best, winDays: a.base_win_days },
    cfgOf(a),
    a.floor_locked,
  );
}

/**
 * What stops a signal for every account before any card looks at it:
 * the news blackout (your minutes either side of a high-impact US release).
 */
async function newsStop(now: Date): Promise<string | null> {
  const sql = await db();
  const [s] = await sql<{ news_minutes: number }[]>`select news_minutes from pass_settings where id = 1`;
  const minutes = s?.news_minutes ?? 0;
  if (!minutes) return null;
  const hits = newsBlock(now, await newsAround(new Date(now.getTime() - minutes * 60_000), new Date(now.getTime() + minutes * 60_000)), minutes);
  return hits.length ? `news blackout: ${[...new Set(hits.map((e) => e.title))].join(", ")} (±${minutes} min)` : null;
}

/**
 * The hedge blocker, in the book: no account goes one way while any other
 * account (pass plan or Autopilot, real or practice) is open the other way.
 * The Mac checks the same thing again at Topstep before it places.
 */
async function hedgeStop(accountId: string, dir: "LONG" | "SHORT"): Promise<string | null> {
  const sql = await db();
  const other = dir === "LONG" ? "SHORT" : "LONG";
  const [p] = await sql<{ account_label: string }[]>`
    select account_label from pass_trades where status in ('open', 'pending') and dir = ${other} and account_id is distinct from ${accountId} limit 1
  `;
  if (p) return `${p.account_label} is ${other.toLowerCase()}: no ${dir.toLowerCase()} on another account, so nothing is hedged`;
  const [b] = await sql<{ account_label: string }[]>`select account_label from bot_trades where status = 'open' and mode = 'live' and dir = ${other} limit 1`;
  return b ? `${b.account_label} (Autopilot) is ${other.toLowerCase()}: no ${dir.toLowerCase()} here, so nothing is hedged` : null;
}

/** One position per account at a time, C or SOR. */
async function busy(accountId: string): Promise<boolean> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from pass_trades where account_id = ${accountId} and status in ('open', 'pending')`;
  return (r?.n ?? 0) > 0;
}

/** When a session's trade must be out (its time exit), as an instant. */
export function exitAt(session: AnySession, tradingDay: string, strategy: Strategy = "C"): Date {
  const [h, m] = (strategy === "SOR" || session === "NYAM" ? SOR_EXIT : SESSION_TIMES[session].exit).split(":").map(Number);
  return zonedToUtc(tradingDay, h! * 60 + m!, NY);
}

/** How long the Mac may sleep: every 5 s from 1 minute before an entry to 3 minutes after, else until the next entry or time exit. */
export function passWaitSeconds(now = new Date()): number {
  const ny = new Intl.DateTimeFormat("en-GB", { timeZone: NY, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => Number(ny.find((p) => p.type === t)!.value);
  const s = g("hour") * 3600 + g("minute") * 60 + g("second");
  const sec = (x: string) => {
    const [h, m] = x.split(":").map(Number);
    return h! * 3600 + m! * 60;
  };
  const entries = Object.values(SESSION_TIMES).map((t) => sec(t.signal) - 60); // the bar closes a minute before the order time
  const exits = Object.values(SESSION_TIMES).map((t) => sec(t.exit) + 3);
  if (entries.some((e) => { const d = (s - e + 86_400) % 86_400; return d >= 0 && d <= 240; })) return 5;
  return Math.max(5, Math.min(...[...entries.map((e) => e - 60), ...exits].map((e) => (e - s + 86_400) % 86_400)));
}

/** Inside one of SOR's entry windows (London's first 150 minutes, NY AM's first 90), with a little slack either side. */
export function sorWindowNow(now = new Date()): boolean {
  const ny = new Intl.DateTimeFormat("en-GB", { timeZone: NY, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const m = Number(ny.find((p) => p.type === "hour")!.value) * 60 + Number(ny.find((p) => p.type === "minute")!.value);
  return Object.values(SOR_SESSIONS).some((w) => m >= w.start - 2 && m <= w.start + w.window + 2);
}

/** Does the Mac need to hold the line open right now: the plan is on, a card trades SOR, and a SOR window is open. */
export async function passListening(now = new Date()): Promise<boolean> {
  if (!sorWindowNow(now)) return false;
  const sql = await db();
  const [s] = await sql<{ mode: string }[]>`select mode from pass_settings where id = 1`;
  if (s?.mode !== "on") return false;
  const cards = await sql<PassAccountRow[]>`select * from pass_accounts where enabled`;
  return cards.some((c) => modeOf(c) === "live" && cfgOf(c).sorOn);
}

/** What the Mac needs for the pass plan: is it on, the accounts it may touch, and the trades it's following. */
export async function passContext() {
  const sql = await db();
  const [s] = await sql<{ mode: string }[]>`select mode from pass_settings where id = 1`;
  const cards = await sql<PassAccountRow[]>`select * from pass_accounts order by created_at`;
  const open = await sql<{ id: string; account_id: string | null; mode: PassMode; session: AnySession; strategy: Strategy; guard: boolean; trading_day: string; dir: string; qty: number; entry_price: number; stop_price: number; target_price: number; entered_at: Date; order_id: string | null }[]>`
    select id, account_id, mode, session, strategy, guard, trading_day, dir, qty, entry_price, stop_price, target_price, entered_at, order_id from pass_trades where status = 'open'
  `;
  const byId = new Map(cards.map((c) => [c.id, c]));
  // Live orders from a TradingView signal, each handed to the Mac once. Not picked up within 45 seconds: missed.
  const stale = await sql<{ account_label: string }[]>`
    update pass_trades set status = 'error', reason = 'your Mac didn''t pick it up in time: nothing placed'
    where status = 'pending' and ((claimed_at is null and entered_at < now() - interval '45 seconds') or claimed_at < now() - interval '3 minutes')
    returning account_label
  `;
  if (stale.length) {
    await logEvent("error", `Pass plan: ${stale.map((x) => x.account_label).join(", ")} missed (Mac didn't pick the order up)`);
    await botNotify(`⚠ Pass plan order missed\n${stale.map((x) => x.account_label).join(", ")}: your Mac didn't pick it up. Check it's on and online.`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
  }
  const pending = await sql<{ id: string; account_id: string | null; account_label: string; strategy: Strategy; dir: string; qty: number; stop_price: number; target_price: number; entry_price: number; filters: { capped?: boolean } | null }[]>`
    update pass_trades set claimed_at = now() where status = 'pending' and claimed_at is null returning id, account_id, account_label, strategy, dir, qty, stop_price, target_price, entry_price, filters
  `;
  return {
    pending: pending.map((t) => ({
      tradeId: t.id,
      label: t.account_label,
      account: (t.account_id && byId.get(t.account_id)?.topstep_account) || null,
      mode: "live" as const,
      strategy: t.strategy,
      dir: t.dir,
      qty: t.qty,
      price: t.entry_price,
      stopTicks: Math.round(Math.abs(t.entry_price - t.stop_price) * 4),
      targetTicks: Math.round(Math.abs(t.target_price - t.entry_price) * 4),
      // SOR trades to its own PRICES: once filled, the Mac moves the stop (and an uncapped target) onto them.
      // A capped target, like every C level, stays a distance from the real fill.
      stopPrice: t.strategy === "SOR" ? t.stop_price : null,
      targetPrice: t.strategy === "SOR" && !t.filters?.capped ? t.target_price : null,
    })),
    on: s?.mode === "on" && cards.some((c) => c.enabled),
    accounts: cards.filter((c) => c.enabled && modeOf(c) === "live").map((c) => ({ cardId: c.id, label: c.label, account: c.topstep_account })),
    open: open.map((t) => ({
      id: t.id,
      cardId: t.account_id,
      label: (t.account_id && byId.get(t.account_id)?.label) || "",
      account: (t.account_id && byId.get(t.account_id)?.topstep_account) || null,
      mode: t.mode,
      session: t.session,
      strategy: t.strategy,
      // The Mac's goal guard: closes at market the moment the target price trades with the position still open.
      guard: t.guard,
      dir: t.dir,
      qty: t.qty,
      entry: t.entry_price,
      stop: t.stop_price,
      target: t.target_price,
      enteredAt: t.entered_at.toISOString(),
      exitAt: exitAt(t.session, t.trading_day, t.strategy).toISOString(),
      orderId: t.order_id,
    })),
  };
}

const r2 = (x: number) => Math.round(x / 0.25) * 0.25;
const clock = (session: AnySession, strategy: Strategy = "C") => `${strategy === "SOR" || session === "NYAM" ? SOR_EXIT : SESSION_TIMES[session].exit} New York`;

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
  let taken = 0;
  const news = await newsStop(new Date());
  for (const a of cards) {
    const st = await statsFor(a);
    const card = toCard(a);
    // Before the account's own rules: the news blackout, one position per account (C or SOR), and no hedging across accounts.
    const block = news ?? ((await busy(a.id)) ? "a trade is already open on this account" : await hedgeStop(a.id, sig.dir));
    const p = block ? ({ take: false, reason: block } as const) : plan(card, st, sig);
    const mode = modeOf(a);
    const id = `pt_${randomToken(10)}`;
    const long = sig.dir === "LONG" ? 1 : -1;
    const stop = p.take ? r2(sig.price - long * p.stopPts) : sig.price;
    const target = p.take ? r2(sig.price + long * p.targetPts) : sig.price;
    const ins = await sql`
      insert into pass_trades (id, account_id, account_label, mode, stage, session, strategy, guard, tv_id, trading_day, dir, qty, entry_price, stop_price, target_price, status, reason, filters, entered_at)
      values (${id}, ${a.id}, ${a.label}, ${mode}, ${a.stage}, ${sig.session}, 'C', ${card.cfg.guard}, ${sig.barTime}, ${sig.tradingDay}, ${sig.dir}, ${p.take ? p.qty : card.cfg.contracts}, ${sig.price}, ${stop}, ${target},
        ${p.take ? (mode === "live" ? "pending" : "open") : "skipped"}, ${p.reason}, ${sql.json({ bias: sig.bias, vah: sig.vah, val: sig.val, barTime: sig.barTime } as never)}, now())
      on conflict (account_id, trading_day, session, strategy) do nothing returning id
    `;
    if (!ins.length) continue; // already decided for this session
    lines.push(`• ${a.label}: ${p.take ? `${mode === "live" ? "placing" : mode === "dry" ? "practice" : "YOURS TO PLACE"} ${p.qty} MNQ · SL ${stop} · TP ${target}` : `skip (${p.reason})`}`);
    if (!p.take) continue;
    taken++;
    if (mode !== "live") {
      // Practice and Lucid: followed on the 1-minute bars from here (entries fill a tick worse, as tested).
      const fill = sig.price + long * 0.25;
      await sql`update pass_trades set entry_price = ${fill}, stop_price = ${stop + long * 0.25}, target_price = ${target + long * 0.25} where id = ${id}`;
    }
    if (mode === "signal") {
      await botNotify(`📣 ${a.label}: ${sig.dir} ${p.qty} MNQ now\nPass plan · ${SESSION_NAME[sig.session]} · @ ~${sig.price} · stop ${stop} · target ${target} · close it at ${clock(sig.session)} if neither is hit`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
    }
    if (mode !== "live") continue;
    plans.push({ tradeId: id, cardId: a.id, label: a.label, account: a.topstep_account, mode, dir: sig.dir, qty: p.qty, stopTicks: p.stopTicks, targetTicks: p.targetTicks });
  }
  await logEvent("info", `Pass plan · ${head}: ${taken} to take`);
  if (lines.length) await sql`insert into bot_events (level, message) values ('info', ${`Pass plan · ${head}\n${lines.join("\n")}`.slice(0, 1900)})`;
  return { plans };
}

export type SorAlert = RawSor & { dir: "LONG" | "SHORT"; entry: number; stop: number; safe_ok: boolean; id: string };

/**
 * A SOR signal for the pass plan (spec section 4). Decided once for every
 * account: only the first valid signal of each session counts, and only if it
 * is safe. Then each card with the add-on on applies its own account rules.
 */
export async function passSor(sig: SorAlert, now = new Date()): Promise<{ status: string }> {
  const sql = await db();
  const [s] = await sql<{ mode: string; sor_health: string }[]>`select mode, sor_health from pass_settings where id = 1`;
  if (s?.mode !== "on") return { status: "off" };
  const v = sorValid(sig);
  if (!v.ok) {
    await logEvent("info", `Pass plan · SOR signal ignored: ${v.reason}`);
    return { status: "invalid" };
  }
  const day = passTradingDay(now);
  const head = `SOR ${SESSION_NAME[v.session]} ${sig.dir} @ ${sig.entry} · SL ${sig.stop} · TP ${v.target}`;
  const note = !sig.safe_ok ? "first valid signal was not safe: no SOR this session" : s.sor_health === "PAUSED" ? "SOR is paused (health)" : await newsStop(now);
  const first = await sql`
    insert into pass_sor_sessions (trading_day, session, tv_id, safe_ok, note) values (${day}, ${v.session}, ${sig.id.slice(0, 80)}, ${sig.safe_ok}, ${note})
    on conflict (trading_day, session) do nothing returning session
  `;
  if (!first.length) {
    await logEvent("info", `Pass plan · ${head}: ${SESSION_NAME[v.session]}'s SOR chance is already used today, ignored`);
    return { status: "used" };
  }
  if (note) {
    await logEvent("info", `Pass plan · ${head}: ${note}`);
    return { status: "not-safe" };
  }
  // A C alert on the same bar (03:30, 10:10) comes first: give it a moment to be written down.
  const bar = Number(sig.id.split("-")[0]);
  if (Number.isFinite(bar)) {
    const hm = new Intl.DateTimeFormat("en-GB", { timeZone: NY, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(bar));
    if (hm === "03:30" || hm === "10:10") await new Promise((r) => setTimeout(r, 5000));
  }
  const cards = await sql<PassAccountRow[]>`select * from pass_accounts where enabled order by created_at`;
  const sign = sig.dir === "LONG" ? 1 : -1;
  const lines: string[] = [];
  let taken = 0;
  for (const a of cards) {
    const card = toCard(a);
    if (!card.cfg.sorOn) continue; // C-only accounts (funded, Lucid) never see SOR
    const st = await statsFor(a);
    const block = (await busy(a.id)) ? "a trade is already open on this account" : await hedgeStop(a.id, sig.dir);
    const p = block ? ({ take: false, reason: block } as const) : planSor(card, st, { session: v.session, dir: sig.dir, entry: sig.entry, stop: sig.stop, target: v.target });
    const mode = modeOf(a);
    const id = `pt_${randomToken(10)}`;
    // Practice and Lucid fill a tick worse, as tested. The stop is SOR's own price; a capped target sits a distance from the fill.
    const slip = mode === "live" ? 0 : sign * 0.25;
    const entry = sig.entry + slip;
    const target = p.take ? (p.capped ? r2(entry + sign * p.targetPts) : v.target) : v.target;
    const ins = await sql`
      insert into pass_trades (id, account_id, account_label, mode, stage, session, strategy, guard, tv_id, trading_day, dir, qty, entry_price, stop_price, target_price, status, reason, filters, entered_at)
      values (${id}, ${a.id}, ${a.label}, ${mode}, ${a.stage}, ${v.session}, 'SOR', ${card.cfg.guard}, ${sig.id.slice(0, 80)}, ${day}, ${sig.dir}, ${p.take ? p.qty : card.cfg.sorContracts}, ${entry}, ${sig.stop}, ${target},
        ${p.take ? (mode === "live" ? "pending" : "open") : "skipped"}, ${p.reason}, ${sql.json({ sor: true, capped: p.take ? p.capped : false, minsIn: sig.mins_in, dow: sig.dow } as never)}, now())
      on conflict (account_id, trading_day, session, strategy) do nothing returning id
    `;
    if (!ins.length) continue;
    lines.push(`• ${a.label}: ${p.take ? `${mode === "live" ? "placing" : mode === "dry" ? "practice" : "YOURS TO PLACE"} ${p.qty} MNQ · SL ${sig.stop} · TP ${target}${p.capped ? " (capped)" : ""}` : `skip (${p.reason})`}`);
    if (!p.take) continue;
    taken++;
    if (mode === "signal") {
      await botNotify(`📣 ${a.label}: ${sig.dir} ${p.qty} MNQ now\nPass plan · SOR ${SESSION_NAME[v.session]} · @ ~${sig.entry} · stop ${sig.stop} · target ${target} · close it at ${clock(v.session, "SOR")} if neither is hit`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
    }
  }
  await logEvent("info", `Pass plan · ${head}: ${taken} to take`);
  if (lines.length) await sql`insert into bot_events (level, message) values ('info', ${`Pass plan · ${head}\n${lines.join("\n")}`.slice(0, 1900)})`;
  return { status: "decided" };
}

/** The SOR health switch (spec 4.6): PAUSED stops SOR on every account, LIVE allows it again. C is never paused. */
export async function setSorHealth(state: "LIVE" | "PAUSED") {
  const sql = await db();
  const ch = await sql`update pass_settings set sor_health = ${state} where id = 1 and sor_health <> ${state} returning id`;
  if (ch.length) await logEvent("warn", `Pass plan · SOR is now ${state}${state === "PAUSED" ? ": no SOR trades until it's LIVE again (C carries on)" : ""}`);
}

/** The Mac's result for each order it was given. */
export async function passResults(results: { tradeId: string; status: "open" | "error"; orderId?: string | null; fill?: number | null; stop?: number | null; target?: number | null; reason?: string | null }[]) {
  const sql = await db();
  for (const r of results) {
    const [t] = await sql<{ account_label: string; mode: PassMode; strategy: Strategy; dir: string; qty: number; entry_price: number; stop_price: number; target_price: number; session: AnySession }[]>`
      select account_label, mode, strategy, dir, qty, entry_price, stop_price, target_price, session from pass_trades where id = ${r.tradeId} and status = 'pending'
    `;
    if (!t) continue;
    if (r.status === "error") {
      await sql`update pass_trades set status = 'error', reason = ${(r.reason ?? "rejected").slice(0, 400)} where id = ${r.tradeId}`;
      await logEvent("error", `Pass plan: order failed on ${t.account_label}: ${r.reason ?? "rejected"}`);
      await botNotify(`⚠ Pass plan order failed · ${t.account_label}\n${r.reason ?? "rejected"}`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
      continue;
    }
    // Keep the stop and target at the same distance from the real fill (that's how the bracket sits at Topstep).
    // The Mac reports where the stop and target really sit (bot 5.0+); an older bot leaves them the same distance from the fill.
    const fill = r.fill && r.fill > 0 ? r.fill : t.entry_price;
    const shift = fill - t.entry_price;
    const stop = r.stop && r.stop > 0 ? r.stop : t.stop_price + shift;
    const target = r.target && r.target > 0 ? r.target : t.target_price + shift;
    await sql`
      update pass_trades set status = 'open', order_id = ${r.orderId ?? null}, entry_price = ${fill}, stop_price = ${stop}, target_price = ${target}, entered_at = now()
      where id = ${r.tradeId}
    `;
    if (t.mode === "live") await botNotify(`Pass plan · ${t.dir} ${t.qty} MNQ on ${t.account_label}\n${t.strategy === "SOR" ? "SOR " : ""}${SESSION_NAME[t.session]} · in @ ${fill} · SL ${stop} · TP ${target}`, { push: true, telegram: false, always: true, url: "/pass" });
  }
}

/** A pass trade closed (stop, target or time exit): book it, then check the account (passed, payout, blown). */
export async function passClosed(r: { tradeId: string; exitPrice: number | null; pnl: number; fees: number; reason: "target" | "stop" | "time" | "goal" | "other"; exitedAt: string }) {
  const sql = await db();
  const [t] = await sql<{ account_id: string | null; account_label: string; mode: PassMode; dir: string; session: AnySession; strategy: Strategy }[]>`
    update pass_trades set status = 'closed', exit_price = ${r.exitPrice}, pnl = ${Math.round(r.pnl * 100) / 100}, fees = ${r.fees}, exit_reason = ${r.reason}, exited_at = ${new Date(r.exitedAt)}
    where id = ${r.tradeId} and status = 'open' returning account_id, account_label, mode, dir, session, strategy
  `;
  if (!t) return;
  const how = r.reason === "time" ? "time exit" : r.reason === "goal" ? "closed at the target by the goal guard" : r.reason;
  await logEvent("info", `Pass plan closed · ${t.account_label}: ${money(r.pnl)} (${how}${r.exitPrice ? ` @ ${r.exitPrice}` : ""})`);
  const lucidTimeExit = t.mode === "signal" && r.reason === "time";
  await botNotify(
    lucidTimeExit
      ? `⏰ ${t.account_label}: close your ${t.dir} now\nPass plan · ${t.strategy === "SOR" ? "SOR " : ""}${SESSION_NAME[t.session]} time exit (${clock(t.session, t.strategy)})`
      : `Pass plan closed · ${money(r.pnl)}\n${t.account_label}${t.mode === "live" ? "" : t.mode === "dry" ? " (practice)" : " (yours)"} · ${how}`,
    { push: t.mode !== "dry", telegram: false, critical: lucidTimeExit, always: true, url: "/pass" },
  );
  if (t.mode === "live") await import("../data/botCopies").then((m) => m.hideBotCopies()).catch(() => 0);
  if (!t.account_id) return;
  const [a] = await sql<PassAccountRow[]>`select * from pass_accounts where id = ${t.account_id}`;
  if (!a) return;
  const done = accountDone(a.stage, cfgOf(a), await statsFor(a));
  if (!done) return;
  const off = await sql`update pass_accounts set enabled = false, done = ${done.kind}, done_note = ${done.text} where id = ${a.id} and done is distinct from ${done.kind} returning id`;
  if (!off.length) return;
  const next =
    done.kind === "passed"
      ? a.firm === "lucid" && a.stage === "eval"
        ? "Set this card to Pre-live when Lucid moves you on, then switch it back on."
        : "When the funded account arrives, set this card to Funded with its new account and switch it on."
      : done.kind === "payout"
        ? "Request your payout, then press Payout taken on the card: it carries on in the same account."
        : "This account is finished.";
  await logEvent(done.kind === "blown" ? "error" : "info", `Pass plan · ${a.label}: ${done.text}. Switched off.`);
  await botNotify(`${done.kind === "blown" ? "💥" : "🏁"} ${a.label}: ${done.kind === "blown" ? "blown" : done.kind === "payout" ? "payout ready" : "passed"}\n${done.text}. Switched off. ${next}`, { push: true, telegram: false, critical: true, always: true, url: "/pass" });
}

export { passTradingDay };
