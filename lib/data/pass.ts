import { db } from "../db";
import { dayGoal, stageRules, type Firm, type PassSession, type Script, type Stage } from "../pass/rules";
import { modeOf, statsFor, type PassAccountRow, type PassMode } from "../pass/server";

export type PassAccountView = {
  id: string;
  label: string;
  firm: Firm;
  stage: Stage;
  script: Script;
  topstepAccount: string;
  contracts: number;
  dll: boolean;
  enabled: boolean;
  dryRun: boolean;
  mode: PassMode;
  baseProfit: number;
  baseBest: number;
  baseWinDays: number;
  done: string | null;
  doneNote: string | null;
  stats: { profit: number; today: number; best: number; winDays: number; floor: number; goal: number; trades: number };
};
export type PassTradeView = {
  id: string;
  account: string;
  mode: PassMode;
  stage: string;
  session: PassSession;
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

export async function passState() {
  const sql = await db();
  const [s] = await sql<{ mode: string }[]>`select mode from pass_settings where id = 1`;
  const rows = await sql<PassAccountRow[]>`select * from pass_accounts order by created_at`;
  const counts = new Map((await sql<{ account_id: string; n: number }[]>`select account_id, count(*)::int as n from pass_trades where status = 'closed' and account_id is not null group by account_id`).map((r) => [r.account_id, r.n]));
  const accounts: PassAccountView[] = [];
  for (const a of rows) {
    const st = await statsFor(a);
    const r = stageRules(a.firm, a.stage, a.dll);
    accounts.push({
      id: a.id,
      label: a.label,
      firm: a.firm,
      stage: a.stage,
      script: a.script,
      topstepAccount: a.topstep_account ?? "",
      contracts: a.contracts,
      dll: a.dll,
      enabled: a.enabled,
      dryRun: a.dry_run,
      mode: modeOf(a),
      baseProfit: a.base_profit,
      baseBest: a.base_best,
      baseWinDays: a.base_win_days,
      done: a.done,
      doneNote: a.done_note,
      stats: { profit: st.profit, today: st.today, best: st.best, winDays: st.winDays, floor: st.floor, goal: dayGoal(a.stage, r, st), trades: counts.get(a.id) ?? 0 },
    });
  }
  const trades = await sql<{ id: string; account_label: string; mode: PassMode; stage: string; session: PassSession; trading_day: string; dir: string; qty: number; entry_price: number; stop_price: number; target_price: number; status: string; reason: string | null; pnl: number | null; exit_reason: string | null; entered_at: Date }[]>`
    select * from pass_trades order by entered_at desc limit 150
  `;
  return {
    on: s?.mode === "on",
    accounts,
    trades: trades.map<PassTradeView>((t) => ({
      id: t.id,
      account: t.account_label,
      mode: t.mode,
      stage: t.stage,
      session: t.session,
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
