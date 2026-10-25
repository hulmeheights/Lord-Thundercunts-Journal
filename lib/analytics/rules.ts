import type { Trade, TradingRules } from "../types";
import { sortByEntry } from "./stats";
import { dayKey, fmtMinute, marketShift, minuteOfDay, parseHHMM } from "./time";

export type RuleId =
  | "maxTrades"
  | "maxDailyLoss"
  | "stopAfterLosses"
  | "maxContracts"
  | "maxLossPerTrade"
  | "session"
  | "cooldown";

export const RULE_LABELS: Record<RuleId, string> = {
  maxTrades: "Max trades per day",
  maxDailyLoss: "Daily loss limit",
  stopAfterLosses: "Stop after losing streak",
  maxContracts: "Max position size",
  maxLossPerTrade: "Max loss per trade",
  session: "Trading window",
  cooldown: "Cool-down after a loss",
};

export type Violation = {
  rule: RuleId;
  day: string;
  tradeIds: string[];
  detail: string;
  /** Net P&L of the trades that broke the rule (what breaking it actually earned/cost). */
  pnl: number;
};

export type RuleReport = {
  violations: Violation[];
  violatingTradeIds: Set<string>;
  /** Net P&L of all rule-breaking trades. Negative = breaking rules cost you money. */
  breakPnl: number;
  /** Net P&L of fully compliant trades. */
  cleanPnl: number;
  byDay: Map<string, { trades: number; violating: number }>;
  byRule: { rule: RuleId; label: string; count: number; pnl: number }[];
};

/**
 * Auto-enforced rules: evaluates every trade against the quantitative rules
 * the trader set, so discipline is measured from facts — not self-reporting.
 */
export function evaluateRules(trades: Trade[], rules: TradingRules, tz: string): RuleReport {
  const violations: Violation[] = [];
  const perDay = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = dayKey(t.entryTime, tz);
    const list = perDay.get(d);
    if (list) list.push(t);
    else perDay.set(d, [t]);
  }

  const startMin = parseHHMM(rules.sessionStart);
  const endMin = parseHHMM(rules.sessionEnd);

  for (const [day, list] of perDay) {
    const dayTrades = sortByEntry(list);
    const add = (rule: RuleId, ts: Trade[], detail: string) => {
      if (!ts.length) return;
      violations.push({ rule, day, tradeIds: ts.map((t) => t.id), detail, pnl: ts.reduce((s, t) => s + t.netPnl, 0) });
    };

    if (rules.maxTradesPerDay && dayTrades.length > rules.maxTradesPerDay) {
      const extra = dayTrades.slice(rules.maxTradesPerDay);
      add("maxTrades", extra, `${dayTrades.length} trades (limit ${rules.maxTradesPerDay})`);
    }

    if (rules.maxDailyLoss && rules.maxDailyLoss > 0) {
      let cum = 0;
      let hitAt = -1;
      dayTrades.forEach((t, i) => {
        if (hitAt >= 0) return;
        cum += t.netPnl;
        if (cum <= -rules.maxDailyLoss!) hitAt = i;
      });
      if (hitAt >= 0) {
        const after = dayTrades.slice(hitAt + 1);
        add("maxDailyLoss", after, `Kept trading after hitting −$${rules.maxDailyLoss} on the day`);
      }
    }

    if (rules.stopAfterConsecutiveLosses && rules.stopAfterConsecutiveLosses > 0) {
      let streak = 0;
      let stopAt = -1;
      dayTrades.forEach((t, i) => {
        if (stopAt >= 0) return;
        streak = t.netPnl < 0 ? streak + 1 : 0;
        if (streak >= rules.stopAfterConsecutiveLosses!) stopAt = i;
      });
      if (stopAt >= 0) {
        add(
          "stopAfterLosses",
          dayTrades.slice(stopAt + 1),
          `Traded on after ${rules.stopAfterConsecutiveLosses} losses in a row`,
        );
      }
    }

    if (rules.maxContracts && rules.maxContracts > 0) {
      const big = dayTrades.filter((t) => (t.maxPosition ?? t.qty) > rules.maxContracts!);
      add("maxContracts", big, `Position above ${rules.maxContracts} contracts`);
    }

    if (rules.maxLossPerTrade && rules.maxLossPerTrade > 0) {
      const big = dayTrades.filter((t) => t.netPnl < -rules.maxLossPerTrade!);
      add("maxLossPerTrade", big, `Loss bigger than −$${rules.maxLossPerTrade}`);
    }

    if (startMin !== null && endMin !== null) {
      // Following New York: on the weeks the clocks are out of step the window moves with the open.
      const sh = rules.followMarket ? marketShift(day, tz) : 0;
      const a = startMin + sh;
      const b = endMin + sh;
      const outside = dayTrades.filter((t) => {
        const m = minuteOfDay(t.entryTime, tz);
        return a <= b ? m < a || m >= b : m < a && m >= b;
      });
      add("session", outside, `Entered outside ${fmtMinute(a)}–${fmtMinute(b)}`);
    }

    if (rules.cooldownMinutesAfterLoss && rules.cooldownMinutesAfterLoss > 0) {
      const quick: Trade[] = [];
      for (let i = 1; i < dayTrades.length; i++) {
        const prev = dayTrades[i - 1]!;
        const cur = dayTrades[i]!;
        if (prev.netPnl >= 0) continue;
        const gap = (new Date(cur.entryTime).getTime() - new Date(prev.exitTime).getTime()) / 60_000;
        if (gap < rules.cooldownMinutesAfterLoss) quick.push(cur);
      }
      add("cooldown", quick, `Re-entered within ${rules.cooldownMinutesAfterLoss}m of a loss`);
    }
  }

  const violatingTradeIds = new Set(violations.flatMap((v) => v.tradeIds));
  let breakPnl = 0;
  let cleanPnl = 0;
  for (const t of trades) {
    if (violatingTradeIds.has(t.id)) breakPnl += t.netPnl;
    else cleanPnl += t.netPnl;
  }

  const byDay = new Map<string, { trades: number; violating: number }>();
  for (const [day, list] of perDay) {
    byDay.set(day, { trades: list.length, violating: list.filter((t) => violatingTradeIds.has(t.id)).length });
  }

  const ruleMap = new Map<RuleId, { count: number; ids: Set<string> }>();
  for (const v of violations) {
    const e = ruleMap.get(v.rule) ?? { count: 0, ids: new Set<string>() };
    e.count++;
    v.tradeIds.forEach((id) => e.ids.add(id));
    ruleMap.set(v.rule, e);
  }
  const pnlOf = new Map(trades.map((t) => [t.id, t.netPnl]));
  const byRule = [...ruleMap.entries()]
    .map(([rule, e]) => ({
      rule,
      label: RULE_LABELS[rule],
      count: e.count,
      pnl: [...e.ids].reduce((s, id) => s + (pnlOf.get(id) ?? 0), 0),
    }))
    .sort((a, b) => a.pnl - b.pnl);

  return { violations, violatingTradeIds, breakPnl, cleanPnl, byDay, byRule };
}
