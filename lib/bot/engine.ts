import "server-only";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { bracketOk, bracketTicks, gate, sessionOf, SESSION_LABEL, targetReached, tradingDayStart, type Alert, type BotAccount } from "./signal";
import { accounts as tsxAccounts, matchAccount, mnq, openPositions, placeBracketed, token, type TsxAccount } from "./topstepx";
import { telegram } from "./notify";

export type BotMode = "off" | "paper" | "live";
type AccountRow = { id: string; label: string; topstep_account: string | null; contracts: number; max_daily_loss: number; max_daily_win: number | null; enabled: boolean; profit_target: number | null; start_balance: number; created_at: Date };
const toAccount = (r: AccountRow): BotAccount => ({ id: r.id, label: r.label, topstepAccountId: r.topstep_account, contracts: r.contracts, maxDailyLoss: r.max_daily_loss, maxDailyWin: r.max_daily_win, enabled: r.enabled, profitTarget: r.profit_target, startBalance: r.start_balance });
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;

export async function logEvent(level: "info" | "warn" | "error", message: string) {
  const sql = await db();
  await sql`insert into bot_events (level, message) values (${level}, ${message.slice(0, 1000)})`;
}

/** A card whose account made its profit target switches itself off until you switch it back on. */
async function switchOff(acct: BotAccount, profit: number) {
  const sql = await db();
  await sql`update bot_accounts set enabled = false, passed_at = now() where id = ${acct.id}`;
  await logEvent("info", `${acct.label} reached its $${acct.profitTarget} profit target (${money(profit)}): switched off`);
  await telegram(`🎯 ${acct.label} reached its profit target (${money(profit)}). Switched off: no more trades on it until you switch it back on.`);
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

/** After a trade closes: note each live account's balance, and switch off any card that has now made its target. */
async function checkTargets(mode: BotMode) {
  const sql = await db();
  const cards = (await sql<AccountRow[]>`select * from bot_accounts where enabled and profit_target is not null`).map(toAccount);
  if (!cards.length) return;
  if (mode === "paper") {
    const profit = await paperProfit();
    for (const c of cards) if (targetReached(c, profit.get(c.id) ?? 0)) await switchOff(c, profit.get(c.id) ?? 0);
    return;
  }
  const list = await tsxAccounts(await token());
  for (const c of cards) {
    const m = c.topstepAccountId ? matchAccount(list, c.topstepAccountId) : null;
    if (!m || m.balance == null) continue;
    await sql`update bot_accounts set last_balance = ${m.balance}, balance_at = now() where id = ${c.id}`;
    if (targetReached(c, m.balance - c.startBalance)) await switchOff(c, m.balance - c.startBalance);
  }
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
    if (mode !== "off") {
      // Give Topstep a moment to settle the closed trade into the balance.
      if (mode === "live") await new Promise((r) => setTimeout(r, 3000));
      await checkTargets(mode).catch((e) => logEvent("warn", `Couldn't check profit targets: ${e instanceof Error ? e.message : String(e)}`));
    }
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

  // Each account's closed P&L since 18:00 New York, and (live) Topstep's side, fetched together.
  const since = tradingDayStart(now);
  const book = mode === "live" ? "live" : "paper";
  const [dayRows, liveOrError] = await Promise.all([
    sql<{ account_id: string; pnl: number }[]>`
      select account_id, coalesce(sum(pnl), 0)::float8 as pnl from bot_trades
      where status = 'closed' and exited_at >= ${since} and mode = ${book} and account_id is not null
      group by account_id
    `,
    mode === "live"
      ? (async () => {
          const t = await token();
          const [contract, list] = await Promise.all([mnq(t), tsxAccounts(t)]);
          return { t, contractId: contract.id, list };
        })().catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
      : Promise.resolve(null),
  ]);
  const day = new Map(dayRows.map((r) => [r.account_id, r.pnl]));
  if (liveOrError instanceof Error) {
    const msg = liveOrError.message;
    for (const acct of accts) await record(acct, "error", msg);
    await logEvent("error", `Entry failed before any order (${msg}): ${head}`);
    await telegram(`ORDER FAILED, no accounts traded (${msg}): ${head}`);
    return { status: "error" };
  }
  const live = liveOrError;

  // Decide every account first (no waiting on Topstep), then send all the orders at once.
  const paper = mode === "paper" ? await paperProfit() : null;
  const used = new Set<number>();
  const go: { acct: BotAccount; match: TsxAccount }[] = [];
  const later: Promise<unknown>[] = [];
  const skip = (acct: BotAccount, why: string) => {
    later.push(record(acct, "skipped", why));
    lines.push(`• ${acct.label}: skipped (${why})`);
  };
  for (const acct of accts) {
    const blocked = gate(acct, day.get(acct.id) ?? 0);
    if (blocked) {
      skip(acct, blocked);
      continue;
    }
    if (mode === "paper") {
      const profit = paper!.get(acct.id) ?? 0;
      if (targetReached(acct, profit)) {
        later.push(switchOff(acct, profit));
        skip(acct, "profit target reached, card switched off");
        continue;
      }
      later.push(record(acct, "open", null));
      lines.push(`• ${acct.label}: ${acct.contracts} MNQ (paper)`);
      continue;
    }
    const match = acct.topstepAccountId ? matchAccount(live!.list, acct.topstepAccountId) : null;
    if (!match) {
      skip(acct, acct.topstepAccountId ? `Topstep account "${acct.topstepAccountId}" not found` : "no Topstep account set on this card");
      continue;
    }
    if (used.has(match.id)) {
      skip(acct, "another card already traded this Topstep account");
      continue;
    }
    used.add(match.id);
    if (match.balance != null) later.push(sql`update bot_accounts set last_balance = ${match.balance}, balance_at = now() where id = ${acct.id}`);
    if (match.balance != null && targetReached(acct, match.balance - acct.startBalance)) {
      later.push(switchOff(acct, match.balance - acct.startBalance));
      skip(acct, "profit target reached, card switched off");
      continue;
    }
    go.push({ acct, match });
  }

  await Promise.all(
    go.map(async ({ acct, match }) => {
      // Never open a second position on an account that's still in one: two
      // positions, or long here while short there, is what gets accounts flagged.
      try {
        const open = await openPositions(live!.t, match.id);
        if (open.some((p) => p.size !== 0)) return skip(acct, "still in a trade at Topstep (not flat)");
      } catch (e) {
        later.push(logEvent("warn", `Couldn't check ${acct.label} is flat (${e instanceof Error ? e.message : String(e)}); placing the order anyway`));
      }
      try {
        const orderId = await placeBracketed(live!.t, { accountId: match.id, contractId: live!.contractId, dir: d.dir, size: acct.contracts, stopTicks, targetTicks, tag: `ltj-${signalId.slice(4, 14)}-${acct.id.slice(-6)}` });
        later.push(record(acct, "open", null, orderId));
        lines.push(`• ${acct.label}: ${acct.contracts} MNQ ✓ (SL ${stopTicks}t / TP ${targetTicks}t)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        later.push(record(acct, "error", msg), logEvent("error", `Order failed on ${acct.label}: ${msg}`));
        lines.push(`• ${acct.label}: ORDER FAILED, check TopstepX`);
      }
    }),
  );
  await Promise.all(later);
  await logEvent("info", `Entry ${mode === "paper" ? "(paper) " : ""}${head}`);
  await telegram(`ENTRY${mode === "paper" ? " (PAPER)" : ""} ${head}\n${lines.join("\n")}`);
  return { status: "entry" };
}
