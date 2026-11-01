import "server-only";
import { db } from "../db";
import { tradingDayStart, type Session } from "../bot/signal";
import type { BotMode } from "../bot/engine";

export type BotAccountView = {
  id: string;
  label: string;
  topstepAccount: string;
  contracts: number;
  maxDailyLoss: number;
  maxDailyWin: number | null;
  enabled: boolean;
  today: number;
  profitTarget: number | null;
  startBalance: number;
  newsRule: boolean;
  /** Profit towards the target: live = last balance − start; paper = paper P&L since the card was added. */
  profit: number | null;
  passedAt: string | null;
}
export type BotTradeView = { id: string; accountLabel: string; mode: "paper" | "live"; session: Session; dir: "LONG" | "SHORT"; qty: number; entry: number; stop: number; target: number; exit: number | null; pnl: number | null; status: "open" | "closed" | "skipped" | "error"; reason: string | null; enteredAt: string; exitedAt: string | null };
export type BotEventView = { level: string; message: string; at: string };

/** Everything the Autopilot page shows. */
export async function autopilotState() {
  const sql = await db();
  const [[settings], accounts, trades, events, [last]] = await Promise.all([
    sql<{ mode: BotMode; updated_at: Date; alert_expires: string | null; news_minutes: number }[]>`select mode, updated_at, alert_expires, news_minutes from bot_settings where id = 1`,
    sql<{ id: string; label: string; topstep_account: string | null; contracts: number; max_daily_loss: number; max_daily_win: number | null; enabled: boolean; profit_target: number | null; start_balance: number; last_balance: number | null; passed_at: Date | null; news_rule: boolean; created_at: Date }[]>`select * from bot_accounts order by created_at`,
    sql<{ id: string; account_label: string; mode: "paper" | "live"; session: Session; dir: "LONG" | "SHORT"; qty: number; entry_price: number; stop_price: number; target_price: number; exit_price: number | null; pnl: number | null; status: BotTradeView["status"]; reason: string | null; entered_at: Date; exited_at: Date | null; account_id: string | null }[]>`
      select * from bot_trades order by entered_at desc limit 300
    `,
    sql<{ level: string; message: string; created_at: Date }[]>`select level, message, created_at from bot_events order by id desc limit 25`,
    sql<{ received_at: Date; event: string }[]>`select received_at, event from bot_signals order by received_at desc limit 1`,
  ]);
  const mode = settings?.mode ?? "off";
  const since = tradingDayStart(new Date());
  const book = mode === "live" ? "live" : "paper";
  const today = new Map<string, number>();
  for (const t of trades) if (t.account_id && t.status === "closed" && t.mode === book && t.exited_at && t.exited_at >= since) today.set(t.account_id, (today.get(t.account_id) ?? 0) + (t.pnl ?? 0));
  return {
    mode,
    alertExpires: settings?.alert_expires ?? null,
    newsMinutes: settings?.news_minutes ?? 11,
    lastSignal: last ? { at: last.received_at.toISOString(), event: last.event } : null,
    accounts: accounts.map<BotAccountView>((a) => {
      const paper = trades.filter((t) => t.account_id === a.id && t.mode === "paper" && t.status === "closed" && t.entered_at >= a.created_at).reduce((s, t) => s + (t.pnl ?? 0), 0);
      return {
        id: a.id, label: a.label, topstepAccount: a.topstep_account ?? "", contracts: a.contracts, maxDailyLoss: a.max_daily_loss, maxDailyWin: a.max_daily_win, enabled: a.enabled,
        today: Math.round((today.get(a.id) ?? 0) * 100) / 100,
        profitTarget: a.profit_target, startBalance: a.start_balance, newsRule: a.news_rule,
        profit: mode === "live" ? (a.last_balance != null ? Math.round((a.last_balance - a.start_balance) * 100) / 100 : null) : Math.round(paper * 100) / 100,
        passedAt: a.passed_at?.toISOString() ?? null,
      };
    }),
    trades: trades.map<BotTradeView>((t) => ({ id: t.id, accountLabel: t.account_label, mode: t.mode, session: t.session, dir: t.dir, qty: t.qty, entry: t.entry_price, stop: t.stop_price, target: t.target_price, exit: t.exit_price, pnl: t.pnl, status: t.status, reason: t.reason, enteredAt: t.entered_at.toISOString(), exitedAt: t.exited_at?.toISOString() ?? null })),
    events: events.map<BotEventView>((e) => ({ level: e.level, message: e.message, at: e.created_at.toISOString() })),
  };
}
