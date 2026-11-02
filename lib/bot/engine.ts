import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { bracketOk, gate, sessionOf, SESSION_LABEL, targetReached, tradingDayStart, type Alert, type BotAccount } from "./signal";
import { runnerStatus } from "./runner";
import { botNotify } from "./notify";
import { newsBlock } from "./news";
import { newsAround, refreshNews } from "./newsFeed";

/**
 * The website side of Autopilot. It has NO connection to Topstep: it stores
 * each alert, keeps the book and runs Paper mode (which places nothing). In
 * Live, the alert is handed to the bot on your Mac, which applies the rules,
 * checks your accounts and places the orders from your own computer, as
 * Topstep requires, then reports back what it did.
 */
export type BotMode = "off" | "paper" | "live";
export type AccountRow = { id: string; label: string; topstep_account: string | null; contracts: number; max_daily_loss: number; max_daily_win: number | null; enabled: boolean; profit_target: number | null; start_balance: number; news_rule: boolean; created_at: Date };
export const toAccount = (r: AccountRow): BotAccount => ({ id: r.id, label: r.label, topstepAccountId: r.topstep_account, contracts: r.contracts, maxDailyLoss: r.max_daily_loss, maxDailyWin: r.max_daily_win, enabled: r.enabled, profitTarget: r.profit_target, startBalance: r.start_balance, newsRule: r.news_rule });
export const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;

export async function logEvent(level: "info" | "warn" | "error", message: string) {
  const sql = await db();
  await sql`insert into bot_events (level, message) values (${level}, ${message.slice(0, 1000)})`;
}

/** A card whose account made its profit target switches itself off until you switch it back on. */
export async function switchOff(acct: Pick<BotAccount, "id" | "label" | "profitTarget">, profit: number) {
  const sql = await db();
  const r = await sql`update bot_accounts set enabled = false, passed_at = now() where id = ${acct.id} and enabled returning id`;
  if (!r.length) return;
  await logEvent("info", `${acct.label} reached its $${acct.profitTarget} profit target (${money(profit)}): switched off`);
  await botNotify(`🎯 ${acct.label} reached its profit target (${money(profit)}). Switched off: no more trades on it until you switch it back on.`);
}

/** Paper profit per card since it was added: the paper book's stand-in for a balance. */
async function paperProfit(): Promise<Map<string, number>> {
  const sql = await db();
  const rows = await sql<{ account_id: string; pnl: number }[]>`
    select t.account_id, coalesce(sum(t.pnl), 0)::float8 as pnl from bot_trades t join bot_accounts a on a.id = t.account_id
    where t.mode = 'paper' and t.status = 'closed' and t.entered_at >= a.created_at group by t.account_id
  `;
  return new Map(rows.map((r) => [r.account_id, r.pnl]));
}

/** Each card's closed P&L since 18:00 New York in one book (from the journal's own records). */
export async function dayPnl(book: "paper" | "live", now = new Date()): Promise<Map<string, number>> {
  const sql = await db();
  const rows = await sql<{ account_id: string; pnl: number }[]>`
    select account_id, coalesce(sum(pnl), 0)::float8 as pnl from bot_trades
    where status = 'closed' and exited_at >= ${tradingDayStart(now)} and mode = ${book} and account_id is not null
    group by account_id
  `;
  return new Map(rows.map((r) => [r.account_id, r.pnl]));
}

/**
 * One TradingView alert, already checked for its secret. A repeat of the same
 * alert within ~90 seconds is ignored. Exits close the book's rows (the
 * bracket already closed the trade). Entries: Off skips, Paper is followed
 * here on paper, Live is handed to your Mac.
 */
export async function handleAlert(raw: string, a: Alert, now = new Date()): Promise<{ status: string }> {
  const sql = await db();
  const d = a.data;
  const [{ mode }] = await sql<{ mode: BotMode }[]>`select mode from bot_settings where id = 1`;
  const session = sessionOf(now);
  const signalId = `sig_${sha256(`${raw}|${Math.floor(now.getTime() / 90_000)}`).slice(0, 24)}`;
  const handoff = d.event === "entry" && mode === "live" ? "waiting" : null;
  const fresh = await sql`
    insert into bot_signals (id, event, dir, price, stop, target, session, mode, received_at, handoff)
    values (${signalId}, ${d.event}, ${"dir" in d ? d.dir : null}, ${a.price}, ${d.event === "entry" ? d.stop : null}, ${d.event === "entry" ? d.target : null}, ${session}, ${mode}, ${now}, ${handoff})
    on conflict (id) do nothing returning id
  `;
  if (!fresh.length) {
    await logEvent("warn", `Duplicate ${d.event} alert ignored`);
    return { status: "duplicate" };
  }

  if (d.event === "flatten") {
    await logEvent("warn", "Flatten alert received: Autopilot can't close positions, so nothing was done. Check TopstepX.");
    await botNotify("FLATTEN received — Autopilot can't close positions. Check TopstepX.");
    return { status: "ignored" };
  }

  if (d.event === "exit") {
    const closed = await sql<{ account_label: string; pnl: number }[]>`
      update bot_trades
      set status = 'closed', exit_price = ${a.price}, exited_at = ${now},
          pnl = round(((${a.price} - entry_price) * (case when dir = 'LONG' then 1 else -1 end) * 2 * qty)::numeric, 2)
      where status = 'open' and dir = ${d.dir}
      returning account_label, pnl
    `;
    if (closed.length) {
      const total = closed.reduce((s, r) => s + r.pnl, 0);
      await logEvent("info", `Exit ${d.dir} @ ${a.price}: ${closed.length} closed, ${money(total)}`);
      await botNotify(`Trade closed · ${money(total)}\n${d.dir} out @ ${a.price}\n${closed.map((r) => `• ${r.account_label}: ${money(r.pnl)}`).join("\n")}`, { push: true });
    } else await logEvent("info", `Exit ${d.dir} @ ${a.price}: nothing open to close`);
    if (mode === "paper") {
      const profit = await paperProfit();
      const cards = (await sql<AccountRow[]>`select * from bot_accounts where enabled and profit_target is not null`).map(toAccount);
      for (const c of cards) if (targetReached(c, profit.get(c.id) ?? 0)) await switchOff(c, profit.get(c.id) ?? 0);
    }
    // Live: your Mac checks the balances against the targets on its next look (asked for here).
    if (mode === "live") await sql`update bot_settings set balances_due = now() where id = 1`;
    return { status: "exit" };
  }

  // ── Entry ─────────────────────────────────────────────────────────────────
  const head = `${d.dir} ${SESSION_LABEL[session]} @ ~${a.price} · SL ${d.stop} · TP ${d.target}`;
  if (mode === "live") {
    const runner = await runnerStatus();
    await logEvent(runner.online ? "info" : "error", runner.online ? `Entry handed to your Mac: ${head}` : `Entry handed to your Mac, but it isn't connected: if it doesn't pick it up within 20 seconds, nothing is placed. ${head}`);
    // If the Mac is off it never asks, so check here too: still waiting after 21 seconds = missed.
    await new Promise((r) => setTimeout(r, 21_000));
    const missed = await sql`update bot_signals set handoff = 'missed' where id = ${signalId} and handoff = 'waiting' returning id`;
    if (missed.length) {
      await logEvent("error", `Your Mac didn't pick up a live signal within 20 seconds: nothing placed. ${head}`);
      await botNotify(`⚠ Your Mac missed a signal\n${head}\nNothing was placed. Check the Mac is on and online.`);
    }
    return { status: "handed-to-mac" };
  }

  const rows = await sql<AccountRow[]>`select * from bot_accounts where enabled order by created_at`;
  let accts = rows.map(toAccount);
  if (!accts.length) {
    await logEvent("warn", `Entry skipped, no accounts switched on: ${head}`);
    await botNotify(`SKIPPED (no accounts on): ${head}`);
    return { status: "no-accounts" };
  }
  const record = (acct: BotAccount, status: "open" | "skipped", reason: string | null) => sql`
    insert into bot_trades (id, signal_id, account_id, account_label, mode, session, dir, qty, entry_price, stop_price, target_price, status, reason, entered_at)
    values (${`bt_${randomToken(10)}`}, ${signalId}, ${acct.id}, ${acct.label}, 'paper', ${session}, ${d.dir}, ${acct.contracts}, ${a.price}, ${d.stop}, ${d.target}, ${status}, ${reason}, ${now})
  `;

  if (mode === "off") {
    for (const acct of accts) await record(acct, "skipped", "Autopilot is off");
    await logEvent("info", `Entry skipped, Autopilot is off: ${head}`);
    await botNotify(`SKIPPED (Autopilot off): ${head}`);
    return { status: "off" };
  }

  // ── Paper: the same rules, followed on paper ──────────────────────────────
  const lines: string[] = [];
  const [{ news_minutes: newsMinutes }] = await sql<{ news_minutes: number }[]>`select news_minutes from bot_settings where id = 1`;
  if (newsMinutes > 0) {
    const from = new Date(now.getTime() - newsMinutes * 60_000);
    const to = new Date(now.getTime() + newsMinutes * 60_000);
    let near = await newsAround(from, to);
    if (!near.length) {
      await refreshNews();
      near = await newsAround(from, to);
    }
    const blocking = newsBlock(now, near, newsMinutes);
    if (blocking.length) {
      const why = `news blackout: ${blocking.map((e) => e.title).join(", ")} at ${new Date(blocking[0]!.at).toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} NY (±${newsMinutes} min)`;
      const out = accts.filter((x) => x.newsRule);
      for (const acct of out) await record(acct, "skipped", why);
      lines.push(...out.map((x) => `• ${x.label}: skipped (${why})`));
      accts = accts.filter((x) => !x.newsRule);
      if (!accts.length) {
        await logEvent("info", `Entry skipped, ${why}: ${head}`);
        await botNotify(`SKIPPED (${why}): ${head}`);
        return { status: "news" };
      }
    }
  }
  const bad = bracketOk(d.dir, a.price, d.stop, d.target);
  if (bad) {
    for (const acct of accts) await record(acct, "skipped", `bad bracket: ${bad}`);
    await logEvent("error", `Entry skipped, ${bad}: ${head}`);
    return { status: "bad-bracket" };
  }
  const [day, profit] = await Promise.all([dayPnl("paper", now), paperProfit()]);
  for (const acct of accts) {
    const blocked = gate(acct, day.get(acct.id) ?? 0);
    if (blocked) {
      await record(acct, "skipped", blocked);
      lines.push(`• ${acct.label}: skipped (${blocked})`);
    } else if (targetReached(acct, profit.get(acct.id) ?? 0)) {
      await switchOff(acct, profit.get(acct.id) ?? 0);
      await record(acct, "skipped", "profit target reached, card switched off");
      lines.push(`• ${acct.label}: skipped (profit target reached)`);
    } else {
      await record(acct, "open", null);
      lines.push(`• ${acct.label}: ${acct.contracts} MNQ (paper)`);
    }
  }
  await logEvent("info", `Entry (paper) ${head}`);
  await botNotify(`Trade placed (paper) · ${head}\n${lines.join("\n")}`, { push: lines.some((l) => l.includes("(paper)")) });
  return { status: "entry" };
}
