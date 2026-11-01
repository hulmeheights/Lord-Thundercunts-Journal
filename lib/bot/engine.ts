import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { bracketOk, bracketTicks, gate, sessionOf, SESSION_LABEL, tradingDayStart, type Alert, type BotAccount } from "./signal";
import { accounts as tsxAccounts, matchAccount, mnq, openPositions, placeBracketed, token } from "./topstepx";
import { telegram } from "./notify";

export type BotMode = "off" | "paper" | "live";
type AccountRow = { id: string; label: string; topstep_account: string | null; contracts: number; max_daily_loss: number; max_daily_win: number | null; enabled: boolean };
const toAccount = (r: AccountRow): BotAccount => ({ id: r.id, label: r.label, topstepAccountId: r.topstep_account, contracts: r.contracts, maxDailyLoss: r.max_daily_loss, maxDailyWin: r.max_daily_win, enabled: r.enabled });
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;

export async function logEvent(level: "info" | "warn" | "error", message: string) {
  const sql = await db();
  await sql`insert into bot_events (level, message) values (${level}, ${message.slice(0, 1000)})`;
}

/**
 * One TradingView alert, already checked for its secret. Entries are mirrored
 * to every enabled account (live: a bracketed market order at Topstep; paper:
 * recorded only). Exits close the ledger rows; the bracket already closed the
 * trade at Topstep. A repeat of the same alert within ~90 seconds is ignored.
 */
export async function handleAlert(raw: string, a: Alert, now = new Date()): Promise<{ status: string }> {
  const sql = await db();
  const d = a.data;
  const [{ mode }] = await sql<{ mode: BotMode }[]>`select mode from bot_settings where id = 1`;
  const session = sessionOf(now);
  const signalId = `sig_${sha256(`${raw}|${Math.floor(now.getTime() / 90_000)}`).slice(0, 24)}`;
  const fresh = await sql`
    insert into bot_signals (id, event, dir, price, stop, target, session, mode, received_at)
    values (${signalId}, ${d.event}, ${"dir" in d ? d.dir : null}, ${a.price}, ${d.event === "entry" ? d.stop : null}, ${d.event === "entry" ? d.target : null}, ${session}, ${mode}, ${now})
    on conflict (id) do nothing returning id
  `;
  if (!fresh.length) {
    await logEvent("warn", `Duplicate ${d.event} alert ignored`);
    return { status: "duplicate" };
  }

  if (d.event === "flatten") {
    await logEvent("warn", "Flatten alert received: Autopilot can't close positions, so nothing was done. Check TopstepX.");
    await telegram("FLATTEN received — Autopilot can't close positions. Check TopstepX.");
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
      await telegram(`EXIT ${d.dir} @ ${a.price}\n${closed.map((r) => `• ${r.account_label}: ${money(r.pnl)}`).join("\n")}\nTotal: ${money(total)}`);
    } else await logEvent("info", `Exit ${d.dir} @ ${a.price}: nothing open to close`);
    return { status: "exit" };
  }

  // ── Entry ─────────────────────────────────────────────────────────────────
  const rows = await sql<AccountRow[]>`select * from bot_accounts where enabled order by created_at`;
  const accts = rows.map(toAccount);
  const head = `${d.dir} ${SESSION_LABEL[session]} @ ~${a.price} · SL ${d.stop} · TP ${d.target}`;
  if (!accts.length) {
    await logEvent("warn", `Entry skipped, no accounts switched on: ${head}`);
    await telegram(`SKIPPED (no accounts on): ${head}`);
    return { status: "no-accounts" };
  }
  const record = (acct: BotAccount, status: "open" | "skipped" | "error", reason: string | null, orderId: string | null = null) => sql`
    insert into bot_trades (id, signal_id, account_id, account_label, mode, session, dir, qty, entry_price, stop_price, target_price, status, reason, order_id, entered_at)
    values (${`bt_${randomToken(10)}`}, ${signalId}, ${acct.id}, ${acct.label}, ${mode === "live" ? "live" : "paper"}, ${session}, ${d.dir}, ${acct.contracts}, ${a.price}, ${d.stop}, ${d.target}, ${status}, ${reason}, ${orderId}, ${now})
  `;
  const lines: string[] = [];

  if (mode === "off") {
    for (const acct of accts) await record(acct, "skipped", "Autopilot is off");
    await logEvent("info", `Entry skipped, Autopilot is off: ${head}`);
    await telegram(`SKIPPED (Autopilot off): ${head}`);
    return { status: "off" };
  }
  const bad = bracketOk(d.dir, a.price, d.stop, d.target);
  if (bad) {
    for (const acct of accts) await record(acct, "skipped", `bad bracket: ${bad}`);
    await logEvent("error", `Entry skipped, ${bad}: ${head}`);
    await telegram(`SKIPPED (${bad}): ${head}`);
    return { status: "bad-bracket" };
  }
  const { stopTicks, targetTicks } = bracketTicks(a.price, d.stop, d.target);

  // Each account's closed P&L since 18:00 New York, in this mode.
  const since = tradingDayStart(now);
  const day = new Map(
    (await sql<{ account_id: string; pnl: number }[]>`
      select account_id, coalesce(sum(pnl), 0)::float8 as pnl from bot_trades
      where status = 'closed' and exited_at >= ${since} and mode = ${mode === "live" ? "live" : "paper"} and account_id is not null
      group by account_id
    `).map((r) => [r.account_id, r.pnl]),
  );

  let live: { t: string; contractId: string; list: Awaited<ReturnType<typeof tsxAccounts>> } | null = null;
  if (mode === "live") {
    try {
      const t = await token();
      const [contract, list] = await Promise.all([mnq(t), tsxAccounts(t)]);
      live = { t, contractId: contract.id, list };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const acct of accts) await record(acct, "error", msg);
      await logEvent("error", `Entry failed before any order (${msg}): ${head}`);
      await telegram(`ORDER FAILED, no accounts traded (${msg}): ${head}`);
      return { status: "error" };
    }
  }

  const used = new Set<number>();
  for (const acct of accts) {
    const blocked = gate(acct, day.get(acct.id) ?? 0);
    if (blocked) {
      await record(acct, "skipped", blocked);
      lines.push(`• ${acct.label}: skipped (${blocked})`);
      continue;
    }
    if (mode === "paper") {
      await record(acct, "open", null);
      lines.push(`• ${acct.label}: ${acct.contracts} MNQ (paper)`);
      continue;
    }
    const match = acct.topstepAccountId ? matchAccount(live!.list, acct.topstepAccountId) : null;
    if (!match) {
      const why = acct.topstepAccountId ? `Topstep account "${acct.topstepAccountId}" not found` : "no Topstep account set on this card";
      await record(acct, "skipped", why);
      lines.push(`• ${acct.label}: skipped (${why})`);
      continue;
    }
    if (used.has(match.id)) {
      await record(acct, "skipped", "another card already traded this Topstep account");
      lines.push(`• ${acct.label}: skipped (same Topstep account as another card)`);
      continue;
    }
    used.add(match.id);
    // Never open a second position on an account that's still in one: two
    // positions, or long here while short there, is what gets accounts flagged.
    try {
      const open = await openPositions(live!.t, match.id);
      if (open.some((p) => p.size !== 0)) {
        const why = "still in a trade at Topstep (not flat)";
        await record(acct, "skipped", why);
        lines.push(`• ${acct.label}: skipped (${why})`);
        continue;
      }
    } catch (e) {
      await logEvent("warn", `Couldn't check ${acct.label} is flat (${e instanceof Error ? e.message : String(e)}); placing the order anyway`);
    }
    try {
      const orderId = await placeBracketed(live!.t, { accountId: match.id, contractId: live!.contractId, dir: d.dir, size: acct.contracts, stopTicks, targetTicks, tag: `ltj-${signalId.slice(4, 14)}-${acct.id.slice(-6)}` });
      await record(acct, "open", null, orderId);
      lines.push(`• ${acct.label}: ${acct.contracts} MNQ ✓ (SL ${stopTicks}t / TP ${targetTicks}t)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await record(acct, "error", msg);
      lines.push(`• ${acct.label}: ORDER FAILED, check TopstepX`);
      await logEvent("error", `Order failed on ${acct.label}: ${msg}`);
    }
  }
  await logEvent("info", `Entry ${mode === "paper" ? "(paper) " : ""}${head}`);
  await telegram(`ENTRY${mode === "paper" ? " (PAPER)" : ""} ${head}\n${lines.join("\n")}`);
  return { status: "entry" };
}
