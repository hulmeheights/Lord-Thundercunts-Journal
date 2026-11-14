import { db } from "../db";
import { dayGoal, defaults, fullRisk, passTradingDay, plan, roomOf, type AnySession, type Firm, type Script, type Stage, type StageCfg, type Strategy } from "../pass/rules";
import { cfgOf, modeOf, statsFor, type PassAccountRow, type PassMode } from "../pass/server";

export type PassAccountView = {
  id: string;
  label: string;
  firm: Firm;
  stage: Stage;
  script: Script;
  topstepAccount: string;
  dll: boolean;
  /** This stage's settings as they trade, the tested defaults for it, and which ones the card changed. */
  cfg: StageCfg;
  defaults: StageCfg;
  changed: string[];
  floorLocked: boolean;
  payouts: number;
  enabled: boolean;
  dryRun: boolean;
  mode: PassMode;
  baseProfit: number;
  baseBest: number;
  baseWinDays: number;
  done: string | null;
  doneNote: string | null;
  stats: { profit: number; today: number; best: number; winDays: number; floor: number; goal: number; left: number; room: number; risk: number; trades: number; todayTrades: number; next: string };
};
export type PassTradeView = {
  id: string;
  account: string;
  mode: PassMode;
  stage: string;
  session: AnySession;
  strategy: Strategy;
  tradingDay: string;
  dir: string;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  status: string;
  reason: string | null;
  pnl: number | null;
  exitReason: string | null;
  enteredAt: string;
};

/** A stand-in signal (a Monday, New York) to show what each card would do with its next C trade. */
const PREVIEW = { session: "NY", tradingDay: "2026-01-05", dir: "LONG", price: 25000, bias: "UP", vah: null, val: null } as const;

export async function passState() {
  const sql = await db();
  const [s] = await sql<{ mode: string; sor_health: string }[]>`select mode, sor_health from pass_settings where id = 1`;
  const today = passTradingDay(new Date());
  const sorToday = await sql<{ session: "LON" | "NYAM"; safe_ok: boolean; note: string | null; at: Date }[]>`select session, safe_ok, note, at from pass_sor_sessions where trading_day = ${today}`;
  const events = await sql<{ level: string; message: string; created_at: Date }[]>`select level, message, created_at from bot_events where message like 'Pass plan%' order by created_at desc limit 60`;
  const rows = await sql<PassAccountRow[]>`select * from pass_accounts order by created_at`;
  const counts = new Map((await sql<{ account_id: string; n: number }[]>`select account_id, count(*)::int as n from pass_trades where status = 'closed' and account_id is not null group by account_id`).map((r) => [r.account_id, r.n]));
  const accounts: PassAccountView[] = [];
  for (const a of rows) {
    const st = await statsFor(a);
    const cfg = cfgOf(a);
    const base = defaults(a.firm, a.stage, a.dll);
    const goal = dayGoal(a.stage, cfg, st);
    accounts.push({
      id: a.id,
      label: a.label,
      firm: a.firm,
      stage: a.stage,
      script: a.script,
      topstepAccount: a.topstep_account ?? "",
      dll: a.dll,
      cfg,
      defaults: base,
      changed: (Object.keys(cfg) as (keyof StageCfg)[]).filter((k) => cfg[k] !== base[k]),
      floorLocked: a.floor_locked,
      payouts: a.payouts,
      enabled: a.enabled,
      dryRun: a.dry_run,
      mode: modeOf(a),
      baseProfit: a.base_profit,
      baseBest: a.base_best,
      baseWinDays: a.base_win_days,
      done: a.done,
      doneNote: a.done_note,
      stats: { profit: st.profit, today: st.today, best: st.best, winDays: st.winDays, floor: st.floor, goal, left: goal - st.today, room: roomOf(cfg, st), risk: fullRisk(cfg), trades: counts.get(a.id) ?? 0, todayTrades: st.todayTrades, next: plan({ firm: a.firm, stage: a.stage, cfg }, st, PREVIEW).reason },
    });
  }
  const trades = await sql<{ id: string; account_label: string; mode: PassMode; stage: string; session: AnySession; strategy: Strategy; trading_day: string; dir: string; qty: number; entry_price: number; stop_price: number; target_price: number; status: string; reason: string | null; pnl: number | null; exit_reason: string | null; entered_at: Date }[]>`
    select * from pass_trades order by entered_at desc limit 150
  `;
  return {
    on: s?.mode === "on",
    sorHealth: (s?.sor_health ?? "LIVE") as "LIVE" | "PAUSED",
    today,
    sorToday: sorToday.map((x) => ({ session: x.session, safe: x.safe_ok, note: x.note, at: x.at.toISOString() })),
    events: events.map((e) => ({ level: e.level, message: e.message, at: e.created_at.toISOString() })),
    accounts,
    trades: trades.map<PassTradeView>((t) => ({
      id: t.id,
      account: t.account_label,
      mode: t.mode,
      stage: t.stage,
      session: t.session,
      strategy: t.strategy,
      tradingDay: t.trading_day,
      dir: t.dir,
      qty: t.qty,
      entry: t.entry_price,
      stop: t.stop_price,
      target: t.target_price,
      status: t.status,
      reason: t.reason,
      pnl: t.pnl,
      exitReason: t.exit_reason,
      enteredAt: t.entered_at.toISOString(),
    })),
  };
}
