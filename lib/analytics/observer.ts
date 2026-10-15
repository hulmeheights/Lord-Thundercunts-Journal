import type { JournalDay, ObstacleKey, OrderParams, PropSettings, RitualItem, Trade, TradingRules } from "../types";
import { fmtMoney, fmtPct, plural } from "../format";
import { evaluateRules, type RuleReport } from "./rules";
import type { TiltReport } from "./tilt";
import { byHour, byMistake, bySetup, dailySeries, sortByEntry, summarize, type Bucket } from "./stats";
import { dayKey, fmtHold, minuteOfDay } from "./time";
import { propStatus } from "./prop";
import { suggestRules, type WhatIfOptions } from "./whatif";

/**
 * The Observer — your trading, described from the outside.
 *
 * People reason far more wisely about someone else's problem than their own
 * (Grossmann & Kross's "Solomon's paradox"), and talking about yourself in the
 * third person measurably cools emotional reactivity. This engine builds the
 * dossier an impartial observer would write about the trader — what they want,
 * what they're actually doing, what's really stopping them, and what to tell
 * them — from their own trades and journal, with every claim carrying numbers.
 */

export type { ObstacleKey, OrderParams };

/** The options the trader picks from when asked "what do you think is stopping them?". */
export const OBSTACLE_LABELS: Record<ObstacleKey, string> = {
  overtrading: "Overtrading",
  revenge: "Revenge trading after losses",
  "holding-losers": "Holding losers too long",
  "cutting-winners": "Cutting winners too early",
  "rule-breaks": "Breaking my own rules",
  "bad-hours": "Trading at the wrong times",
  "sizing-up": "Sizing up after losses",
  unprepared: "Trading without preparing",
  mistakes: "Repeating the same mistake",
  fees: "Fees eating the profits",
};

export const OBSTACLE_KEYS = Object.keys(OBSTACLE_LABELS) as ObstacleKey[];

export type Tone = "pos" | "neg" | "flat";
export type Evidence = { label: string; value: string; tone?: Tone };

/** A concrete instruction in if-then form (implementation intention). */
export type Instruction = {
  obstacle: ObstacleKey;
  when: string;
  then: string;
  /** The numbers the sentence is written with — and that a pinned order is checked against. */
  params: OrderParams;
  /** A rule the Rule Lab says would have paid, with its dollar delta. */
  backtest: { label: string; opts: WhatIfOptions; delta: number } | null;
  /** Changes to the auto-enforced rules that make the instruction stick. */
  rulesPatch: Partial<TradingRules> | null;
  /** A daily checklist line that makes the instruction a habit. */
  checklist: string | null;
};

export type Obstacle = {
  key: ObstacleKey;
  title: string; // third person, e.g. "Lord keeps trading after the 3rd trade"
  short: string; // verb phrase for headlines, e.g. "keeps trading after the 3rd trade"
  detail: string;
  /** Dollars this pattern cost over the window (positive = money lost). Obstacles overlap, so never sum them. */
  cost: number;
  sample: number;
  confidence: "low" | "medium" | "high";
  evidence: Evidence[];
  instruction: Instruction;
};

/** An observation: a short serif title over the full sentence with the numbers. */
export type Fact = { title: string; text: string; tone: Tone };
export type Want = { text: string; source: "stated" | "prop" | "rules" | "intention" };

export type ObserverDossier = {
  name: string;
  from: string;
  to: string;
  sample: { trades: number; days: number; low: boolean };
  headline: string;
  /** The same verdict, a little longer, with the obstacle phrase in *asterisks* for italics. */
  headlineMd: string;
  wants: Want[];
  doing: Fact[];
  strengths: Fact[];
  stopping: Obstacle[];
  tell: Instruction[];
};

export type PerceptionGap = {
  /** "aligned" — the data's biggest obstacle is one they named; "partial" — they named a real one, just not the biggest; "blind" — the data disagrees. */
  verdict: "aligned" | "partial" | "blind" | "unknown";
  believed: ObstacleKey[];
  dataTop: Obstacle | null;
  /** Rank (1-based) of each believed obstacle in the data, or null when the data shows no cost from it. */
  ranks: { key: ObstacleKey; rank: number | null; cost: number }[];
  message: string;
};

const r0 = (n: number) => Math.round(n);

function confidence(n: number): Obstacle["confidence"] {
  return n >= 30 ? "high" : n >= 10 ? "medium" : "low";
}

/** The short name the observer uses ("Lord Thundercunt" → "Lord"). */
export function observerName(profileName: string, override?: string | null): string {
  const o = override?.trim();
  if (o) return o.slice(0, 40);
  const first = profileName.trim().split(/\s+/)[0];
  return first || "The trader";
}

function hourLabel(b: Bucket): string {
  const h = Number(b.key);
  const next = String((h + 1) % 24).padStart(2, "0");
  return `${b.label}–${next}:00`;
}

function perDayByEntry(trades: Trade[], tz: string): Map<string, Trade[]> {
  const days = new Map<string, Trade[]>();
  for (const t of sortByEntry(trades)) {
    const d = dayKey(t.entryTime, tz);
    const list = days.get(d);
    if (list) list.push(t);
    else days.set(d, [t]);
  }
  return days;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Was this journal day "prepared" — an intention written or at least half the pre-market ritual ticked? */
function prepared(j: JournalDay | undefined, preIds: string[]): boolean {
  if (!j) return false;
  if (j.intention && j.intention.trim().length >= 3) return true;
  if (!preIds.length) return false;
  const done = preIds.filter((id) => j.checklist[id]).length;
  return done / preIds.length >= 0.5;
}

// ── Orders ───────────────────────────────────────────────────────────────
// An instruction is an implementation intention ("When X, then Y"). Its words
// are generated from a handful of numbers, so the same numbers can later check
// whether the order was kept — the sentence and the check can never disagree.

const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;

/** The if-then sentence for an obstacle, written with `params`. */
export function orderText(key: ObstacleKey, p: OrderParams, name: string): { when: string; then: string; params: OrderParams } {
  const n = (v: number | undefined, fallback: number) => Math.max(1, Math.round(v ?? fallback));
  switch (key) {
    case "overtrading": {
      const limit = n(p.limit, 3);
      return { when: `${name} has taken ${plural(limit, "trade")}`, then: "the platform closes. Done for the day — win or lose.", params: { limit } };
    }
    case "revenge": {
      const minutes = n(p.minutes, 10);
      return { when: `${name} takes a loss`, then: `hands off the mouse, stands up, and waits ${minutes} minutes before even looking for the next trade.`, params: { minutes } };
    }
    case "holding-losers": {
      const minutes = n(p.minutes, 5);
      return { when: `a trade isn't working after ${plural(minutes, "minute")}`, then: `${name} takes the planned stop. No moving it, no hoping.`, params: { minutes } };
    }
    case "cutting-winners":
      return { when: "a trade reaches 1R in profit", then: `${name} moves the stop to break-even and leaves the target alone.`, params: {} };
    case "rule-breaks":
      return {
        when: `${name} feels the urge to break ${p.label ? `the “${p.label}” rule` : "a rule"}`,
        then: "the rule gets read out loud and the platform closes for 15 minutes.",
        params: p.label ? { label: p.label } : {},
      };
    case "bad-hours": {
      const hour = Math.min(23, Math.max(0, Math.round(p.hour ?? 12)));
      return { when: `the clock reaches ${hh(hour)}`, then: `${name} doesn't open a new trade until the hour is over.`, params: { hour } };
    }
    case "sizing-up": {
      const qty = n(p.qty, 1);
      return { when: `${name} has just lost`, then: `the next trade is ${plural(qty, "contract")} or smaller — never bigger.`, params: { qty } };
    }
    case "unprepared":
      return { when: "the market is about to open", then: `${name} doesn't place an order until the pre-market checklist and the day's intention are done.`, params: {} };
    case "mistakes": {
      const label = p.label || "same old";
      return { when: `${name} feels a “${label}” coming on`, then: "the hands come off the keyboard and the idea goes in the journal, not the market.", params: { label } };
    }
    case "fees": {
      const limit = n(p.limit, 3);
      return { when: `${name} is about to take a trade that isn't an A+ setup`, then: `it gets skipped — no more than ${limit} a day, so the edge isn't paid away in fees.`, params: { limit } };
    }
  }
}

/** kept · broken · untested (nothing happened that could test it) · self (the data can't see it). */
export type OrderVerdict = "kept" | "broken" | "untested" | "self";
export type OrderCheck = { day: string; verdict: OrderVerdict; reason: string; trades: number };

export type OrderContext = {
  /** Any span of trades; only those entered on `day` count. */
  trades: Trade[];
  /** The journal for `day`, if any (the "unprepared" order reads it). */
  journal?: JournalDay | null;
  rules: TradingRules;
  ritual: RitualItem[];
  tz: string;
};

/** Every obstacle key the data can check by itself (the rest are self-reported). */
export const CHECKABLE: Record<ObstacleKey, boolean> = {
  overtrading: true,
  revenge: true,
  "holding-losers": true,
  "cutting-winners": false,
  "rule-breaks": true,
  "bad-hours": true,
  "sizing-up": true,
  unprepared: true,
  mistakes: true,
  fees: true,
};

const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

/**
 * Was the order kept on `day`? Judged only from that day's trades (and journal),
 * so the verdict is automatic — no self-reporting, no arguing with yourself.
 */
export function checkOrder(key: ObstacleKey, p: OrderParams, day: string, ctx: OrderContext): OrderCheck {
  const list = sortByEntry(ctx.trades.filter((t) => dayKey(t.entryTime, ctx.tz) === day));
  const count = list.length;
  const out = (verdict: OrderVerdict, reason: string): OrderCheck => ({ day, verdict, reason, trades: count });
  const nothing = () => out("untested", "No trades — nothing to test.");
  const { params } = orderText(key, p, "");

  switch (key) {
    case "overtrading":
    case "fees": {
      const limit = params.limit!;
      if (!count) return nothing();
      return count > limit
        ? out("broken", `${count} trades — ${count - limit} past the ${limit}.`)
        : out("kept", `${plural(count, "trade")}, inside the ${limit}.`);
    }
    case "revenge": {
      const wait = params.minutes!;
      if (!count) return nothing();
      const losses = list.filter((t) => t.netPnl < 0).length;
      const gaps: number[] = [];
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i]!.netPnl < 0) gaps.push(Math.max(0, minutesBetween(list[i]!.exitTime, list[i + 1]!.entryTime)));
      }
      if (!losses) return out("untested", "No losing trade, so nothing to wait out.");
      if (!gaps.length) return out("kept", "A loss, and no rush back in.");
      const gap = Math.min(...gaps);
      return gap < wait
        ? out("broken", `Back in ${Math.round(gap)} minute${Math.round(gap) === 1 ? "" : "s"} after a loss — the order says ${wait}.`)
        : out("kept", `Waited at least ${Math.floor(gap)} minutes after every loss.`);
    }
    case "holding-losers": {
      const cap = params.minutes!;
      if (!count) return nothing();
      const losers = list.filter((t) => t.netPnl < 0);
      if (!losers.length) return out("untested", "No losing trade to cut.");
      const longest = Math.max(...losers.map((t) => minutesBetween(t.entryTime, t.exitTime)));
      return longest > cap + 0.5
        ? out("broken", `A loser was held ${fmtHold(longest)} — past the ${cap}-minute line.`)
        : out("kept", `Every loser was closed inside ${plural(cap, "minute")}.`);
    }
    case "sizing-up": {
      const cap = params.qty!;
      if (!count) return nothing();
      let tested = false;
      let biggest = 0;
      for (let i = 1; i < list.length; i++) {
        if (list[i - 1]!.netPnl < 0) {
          tested = true;
          biggest = Math.max(biggest, list[i]!.qty);
        }
      }
      if (!tested) return out("untested", "No trade straight after a loss.");
      return biggest > cap
        ? out("broken", `Went to ${plural(biggest, "contract")} straight after a loss.`)
        : out("kept", `${plural(cap, "contract")} or fewer after every loss.`);
    }
    case "bad-hours": {
      const hour = params.hour!;
      if (!count) return nothing();
      const inside = list.filter((t) => Math.floor(minuteOfDay(t.entryTime, ctx.tz) / 60) === hour);
      return inside.length
        ? out("broken", `${plural(inside.length, "trade")} opened between ${hh(hour)} and ${hh(hour + 1)}.`)
        : out("kept", `Nothing opened between ${hh(hour)} and ${hh(hour + 1)}.`);
    }
    case "rule-breaks": {
      if (!count) return nothing();
      const v = evaluateRules(list, ctx.rules, ctx.tz).violations[0];
      return v ? out("broken", `${v.detail.charAt(0).toUpperCase()}${v.detail.slice(1)}.`) : out("kept", "Every rule held.");
    }
    case "mistakes": {
      const label = params.label!;
      if (!count) return nothing();
      const hits = list.filter((t) => t.mistakes.some((m) => m.toLowerCase() === label.toLowerCase())).length;
      return hits
        ? out("broken", `Tagged “${label}” ${hits === 1 ? "once" : `${hits} times`}.`)
        : out("kept", `No “${label}” in ${plural(count, "trade")}.`);
    }
    case "unprepared": {
      const preIds = ctx.ritual.filter((i) => i.group === "pre").map((i) => i.id);
      if (prepared(ctx.journal ?? undefined, preIds)) return out("kept", count ? "Prepared before the first order." : "Prepared — checklist and intention done.");
      return count ? out("broken", "Traded without the checklist or an intention.") : out("untested", "Not prepared yet — and no trades.");
    }
    case "cutting-winners":
      return out("self", "The data can't see where the target was. Only you can say.");
  }
}

export type ObserverInput = {
  name: string;
  trades: Trade[];
  journals: JournalDay[];
  rules: RuleReport;
  tilt: TiltReport;
  settings: { rules: TradingRules; prop: PropSettings; ritual: RitualItem[] };
  tz: string;
  from: string;
  to: string;
  /** What the trader wrote they want (third person), if anything. */
  statedWant?: string | null;
};

export function buildDossier(input: ObserverInput): ObserverDossier {
  const { name, trades, journals, rules, tilt, settings, tz } = input;
  const s = summarize(trades, settings.rules.defaultRisk);
  const days = dailySeries(trades, tz);
  const byDay = perDayByEntry(trades, tz);
  const journalByDay = new Map(journals.map((j) => [j.day, j]));
  const tradeDays = days.length;
  const low = trades.length < 10;

  // ── Wants ────────────────────────────────────────────────────────────────
  const wants: Want[] = [];
  if (input.statedWant?.trim()) wants.push({ text: input.statedWant.trim(), source: "stated" });
  if (settings.prop.enabled) {
    const st = propStatus(trades, settings.prop, tz);
    const phase = settings.prop.phase === "combine" ? "evaluation" : "funded account";
    const left = st.requiredProfit != null ? st.requiredProfit - st.profit : null;
    wants.push({
      text:
        left != null && left > 0
          ? `${name} wants to pass the ${settings.prop.firm} ${settings.prop.preset} ${phase} — ${fmtMoney(left)} still to make without breaching a ${fmtMoney(st.cushion)} cushion.`
          : `${name} wants to keep the ${settings.prop.firm} ${settings.prop.preset} ${phase} alive and growing.`,
      source: "prop",
    });
  }
  const r = settings.rules;
  const ruleBits = [
    r.maxTradesPerDay ? `no more than ${r.maxTradesPerDay} trades a day` : null,
    r.maxDailyLoss ? `never losing more than ${fmtMoney(r.maxDailyLoss)} in a day` : null,
    r.stopAfterConsecutiveLosses ? `stopping after ${r.stopAfterConsecutiveLosses} losses in a row` : null,
  ].filter(Boolean);
  if (ruleBits.length) wants.push({ text: `${name} has set out to trade with discipline: ${ruleBits.join(", ")}.`, source: "rules" });
  const lastIntention = [...journals].reverse().find((j) => j.intention && j.intention.trim().length >= 3);
  if (lastIntention) wants.push({ text: `The last intention ${name} set: “${lastIntention.intention!.trim().slice(0, 160)}”`, source: "intention" });

  // ── Doing (plain facts) ──────────────────────────────────────────────────
  const doing: Fact[] = [];
  if (trades.length) {
    const perDay = trades.length / Math.max(1, tradeDays);
    const over = Boolean(r.maxTradesPerDay && perDay > r.maxTradesPerDay);
    doing.push({
      title: over ? "Trades more than planned" : "Trades within the plan",
      text: `${name} took ${trades.length} trade${trades.length === 1 ? "" : "s"} over ${tradeDays} trading day${tradeDays === 1 ? "" : "s"} — ${perDay.toFixed(1)} a day${r.maxTradesPerDay ? ` against a limit of ${r.maxTradesPerDay}` : ""}.`,
      tone: over ? "neg" : "flat",
    });
    doing.push({
      title: s.net > 0 ? "In profit" : s.net < 0 ? "Under water" : "Flat",
      text: `Net ${fmtMoney(s.net, { sign: true })}. Wins ${fmtPct(s.winRate)} of trades; the average win is ${fmtMoney(s.avgWin)} and the average loss ${fmtMoney(s.avgLoss)}.`,
      tone: s.net > 0 ? "pos" : s.net < 0 ? "neg" : "flat",
    });
    if (s.wins && s.losses) {
      const ratio = s.avgHoldLoss / Math.max(0.01, s.avgHoldWin);
      doing.push({
        title: ratio > 1.5 ? "Lets losers run" : ratio > 1 ? "Holds losers a little longer" : "Cuts losers faster than winners",
        text: `Holds winners for ${fmtHold(s.avgHoldWin)} and losers for ${fmtHold(s.avgHoldLoss)}.`,
        tone: ratio > 1.5 ? "neg" : "flat",
      });
    }
    if (tilt.afterLoss.trades >= 3) {
      const worse = tilt.afterLoss.expectancy < s.expectancy;
      doing.push({
        title: worse ? "Worse after a loss" : "Steady after a loss",
        text: `After a loss, the next trade averages ${fmtMoney(tilt.afterLoss.expectancy, { sign: true })} (overall ${fmtMoney(s.expectancy, { sign: true })})${tilt.medianReentryAfterLoss != null ? `, and it usually comes ${Math.round(tilt.medianReentryAfterLoss)} minute${Math.round(tilt.medianReentryAfterLoss) === 1 ? "" : "s"} later` : ""}.`,
        tone: worse ? "neg" : "pos",
      });
    }
    if (rules.violations.length) {
      doing.push({
        title: rules.breakPnl < 0 ? "Breaks the rules, and pays for it" : "Bends the rules",
        text: `${name} broke the rules set in Settings ${rules.violations.length} time${rules.violations.length === 1 ? "" : "s"}; those trades netted ${fmtMoney(rules.breakPnl, { sign: true })}.`,
        tone: rules.breakPnl < 0 ? "neg" : "flat",
      });
    }
  }
  const journaled = days.filter((d) => {
    const j = journalByDay.get(d.day);
    return j && ((j.review?.trim().length ?? 0) >= 10 || (j.lessons?.trim().length ?? 0) >= 10);
  }).length;
  if (tradeDays) {
    const share = journaled / tradeDays;
    doing.push({
      title: share >= 0.7 ? "Reviews the day" : share < 0.4 ? "Rarely looks back" : "Reviews some days",
      text: `Wrote a proper review on ${journaled} of ${tradeDays} trading day${tradeDays === 1 ? "" : "s"}.`,
      tone: share >= 0.7 ? "pos" : share < 0.4 ? "neg" : "flat",
    });
  }

  // ── Strengths (a fair observer says what's working too) ──────────────────
  // Each strength also carries a short clause for the headline ("the 09:00 hour pays +$2,372").
  const strengths: (Fact & { clause: string })[] = [];
  const hours = byHour(trades, tz).filter((b) => b.trades >= 5);
  const bestHour = [...hours].sort((a, b) => b.net - a.net)[0];
  if (bestHour && bestHour.net > 0) {
    strengths.push({
      title: `The ${bestHour.label} hour`,
      text: `Makes ${fmtMoney(bestHour.net, { sign: true })} between ${hourLabel(bestHour)} (${bestHour.trades} trades, ${fmtPct(bestHour.winRate)} wins).`,
      tone: "pos",
      clause: `the ${bestHour.label} hour pays ${fmtMoney(bestHour.net, { sign: true })}`,
    });
  }
  const setups = bySetup(trades).filter((b) => b.trades >= 5);
  const bestSetup = [...setups].sort((a, b) => b.expectancy - a.expectancy)[0];
  if (bestSetup && bestSetup.expectancy > 0) {
    strengths.push({
      title: `The ${bestSetup.label}`,
      text: `Pays ${fmtMoney(bestSetup.expectancy, { sign: true })} a trade over ${bestSetup.trades} trades.`,
      tone: "pos",
      clause: `the ${bestSetup.label} pays ${fmtMoney(bestSetup.expectancy, { sign: true })} a trade`,
    });
  }
  if (rules.cleanPnl > 0 && rules.violatingTradeIds.size) {
    strengths.push({
      title: "Following the rules",
      text: `When ${name} follows the rules, the trades net ${fmtMoney(rules.cleanPnl, { sign: true })}.`,
      tone: "pos",
      clause: `the trades inside the rules net ${fmtMoney(rules.cleanPnl, { sign: true })}`,
    });
  }
  const greenDays = days.filter((d) => d.net > 0).length;
  if (tradeDays >= 5 && greenDays / tradeDays >= 0.55) {
    strengths.push({
      title: "More green days than red",
      text: `Green on ${greenDays} of ${tradeDays} days.`,
      tone: "pos",
      clause: `${greenDays} of ${tradeDays} days finish green`,
    });
  }

  // ── Stopping (ranked by what each pattern cost) ──────────────────────────
  const stopping: Obstacle[] = [];
  const backtests = suggestRules(trades, tz);
  const findTest = (pred: (o: WhatIfOptions) => boolean) => {
    const hit = backtests.find((b) => pred(b.opts));
    return hit ? { label: hit.label, opts: hit.opts, delta: hit.delta } : null;
  };

  // Overtrading: trades beyond the day's limit (or the 3rd if none is set).
  const limit = r.maxTradesPerDay ?? 3;
  const late: Trade[] = [];
  for (const list of byDay.values()) late.push(...list.slice(limit));
  const lateNet = late.reduce((a, t) => a + t.netPnl, 0);
  if (late.length >= 3 && lateNet < 0) {
    const nth = limit === 1 ? "1st" : limit === 2 ? "2nd" : limit === 3 ? "3rd" : `${limit}th`;
    stopping.push({
      key: "overtrading",
      title: `${name} keeps trading after the ${nth} trade`,
      short: `keeps trading after the ${nth} trade`,
      detail: `Trades taken after the ${nth} of the day netted ${fmtMoney(lateNet, { sign: true })} over ${late.length} trades. The first ${limit} of each day did the work.`,
      cost: -lateNet,
      sample: late.length,
      confidence: confidence(late.length),
      evidence: [
        { label: `Trades after #${limit}`, value: String(late.length) },
        { label: "Their net", value: fmtMoney(lateNet, { sign: true }), tone: "neg" },
      ],
      instruction: {
        obstacle: "overtrading",
        ...orderText("overtrading", { limit }, name),
        backtest: findTest((o) => o.maxTradesPerDay != null),
        rulesPatch: { maxTradesPerDay: limit },
        checklist: `Stopped at ${limit} trade${limit === 1 ? "" : "s"}`,
      },
    });
  }

  // Revenge trading: Tilt Radar flags.
  if (tilt.flaggedIds.size >= 2 && tilt.tiltCost < 0) {
    const cool = Math.max(10, r.cooldownMinutesAfterLoss ?? 0);
    stopping.push({
      key: "revenge",
      title: `${name} trades angry after losses`,
      short: "jumps straight back in after a loss",
      detail: `${tilt.flaggedIds.size} trades look like revenge — fast re-entries, size-ups or trading deep into a losing streak — and they cost ${fmtMoney(-tilt.tiltCost)}.${tilt.medianReentryAfterLoss != null ? ` After a loss the next entry usually comes ${Math.round(tilt.medianReentryAfterLoss)} minutes later.` : ""}`,
      cost: -tilt.tiltCost,
      sample: tilt.flaggedIds.size,
      confidence: confidence(tilt.flaggedIds.size),
      evidence: [
        { label: "Revenge trades", value: String(tilt.flaggedIds.size) },
        { label: "Win rate when tilted", value: fmtPct(tilt.flaggedWinRate), tone: "neg" },
        { label: "Win rate otherwise", value: fmtPct(tilt.cleanWinRate), tone: "pos" },
      ],
      instruction: {
        obstacle: "revenge",
        ...orderText("revenge", { minutes: cool }, name),
        backtest: findTest((o) => o.skipTilt === true || o.stopAfterLosses != null),
        rulesPatch: { cooldownMinutesAfterLoss: cool },
        checklist: `Waited ${cool} minutes after every loss`,
      },
    });
  }

  // Holding losers: losers held far longer than winners.
  const winners = trades.filter((t) => t.netPnl > 0);
  const losers = trades.filter((t) => t.netPnl < 0);
  if (winners.length >= 5 && losers.length >= 5 && s.avgHoldLoss > s.avgHoldWin * 1.5) {
    const holdOf = (t: Trade) => (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / 60_000;
    const cut = Math.max(1, s.avgHoldWin * 2);
    const long = losers.filter((t) => holdOf(t) > cut);
    const quick = losers.filter((t) => holdOf(t) <= cut);
    const quickAvg = quick.length ? quick.reduce((a, t) => a + -t.netPnl, 0) / quick.length : s.avgLoss;
    const excess = long.reduce((a, t) => a + Math.max(0, -t.netPnl - quickAvg), 0);
    if (long.length >= 2 && excess > 0) {
      const ratio = s.avgHoldLoss / Math.max(0.01, s.avgHoldWin);
      const bail = Math.max(1, Math.round(s.avgHoldWin * 1.5));
      stopping.push({
        key: "holding-losers",
        title: `${name} holds losers ${ratio.toFixed(1)}× longer than winners`,
        short: "holds losing trades and hopes",
        detail: `Losers last ${fmtHold(s.avgHoldLoss)} on average, winners ${fmtHold(s.avgHoldWin)}. The ${long.length} losers held past ${fmtHold(cut)} lost ${fmtMoney(excess)} more than the ones cut quickly.`,
        cost: excess,
        sample: long.length,
        confidence: confidence(losers.length),
        evidence: [
          { label: "Avg winner held", value: fmtHold(s.avgHoldWin), tone: "pos" },
          { label: "Avg loser held", value: fmtHold(s.avgHoldLoss), tone: "neg" },
          { label: "Extra lost by hoping", value: fmtMoney(excess), tone: "neg" },
        ],
        instruction: {
          obstacle: "holding-losers",
          ...orderText("holding-losers", { minutes: bail }, name),
          backtest: null,
          rulesPatch: null,
          checklist: "Every loser closed at its planned stop",
        },
      });
    }
  }

  // Cutting winners: wins often but small; losses big.
  if (winners.length >= 8 && losers.length >= 5 && s.winRate >= 0.5 && s.payoff < 0.8) {
    const shortfall = (s.avgLoss * 0.8 - s.avgWin) * s.wins;
    if (shortfall > 0) {
      stopping.push({
        key: "cutting-winners",
        title: `${name} cuts winners short`,
        short: "takes profits too early",
        detail: `${name} is right ${fmtPct(s.winRate)} of the time but the average win (${fmtMoney(s.avgWin)}) is far smaller than the average loss (${fmtMoney(s.avgLoss)}). Letting winners get to just 80% of a loser's size would have added about ${fmtMoney(shortfall)}.`,
        cost: shortfall,
        sample: winners.length,
        confidence: confidence(winners.length),
        evidence: [
          { label: "Win rate", value: fmtPct(s.winRate), tone: "pos" },
          { label: "Avg win ÷ avg loss", value: `${s.payoff.toFixed(2)}×`, tone: "neg" },
        ],
        instruction: {
          obstacle: "cutting-winners",
          ...orderText("cutting-winners", {}, name),
          backtest: null,
          rulesPatch: null,
          checklist: "Let a winner reach its target",
        },
      });
    }
  }

  // Breaking own rules (the costliest rule leads).
  if (rules.violations.length >= 2 && rules.breakPnl < 0) {
    const worst = rules.byRule[0];
    stopping.push({
      key: "rule-breaks",
      title: `${name} doesn't follow the rules already written down`,
      short: "ignores the rules already written down",
      detail: `${rules.violations.length} rule breaks, and the trades involved netted ${fmtMoney(rules.breakPnl, { sign: true })}. Compliant trades netted ${fmtMoney(rules.cleanPnl, { sign: true })}.${worst ? ` Costliest: ${worst.label.toLowerCase()} (${worst.count}×, ${fmtMoney(worst.pnl, { sign: true })}).` : ""}`,
      cost: -rules.breakPnl,
      sample: rules.violatingTradeIds.size,
      confidence: confidence(rules.violatingTradeIds.size),
      evidence: [
        { label: "Rule-breaking trades", value: fmtMoney(rules.breakPnl, { sign: true }), tone: "neg" },
        { label: "Clean trades", value: fmtMoney(rules.cleanPnl, { sign: true }), tone: rules.cleanPnl >= 0 ? "pos" : "neg" },
      ],
      instruction: {
        obstacle: "rule-breaks",
        ...orderText("rule-breaks", worst ? { label: worst.label.toLowerCase() } : {}, name),
        backtest: null,
        rulesPatch: null,
        checklist: "Kept every rule I set",
      },
    });
  }

  // Bad hours: the worst entry hour.
  const worstHour = [...hours].sort((a, b) => a.net - b.net)[0];
  if (worstHour && worstHour.net < 0 && worstHour.expectancy < 0) {
    stopping.push({
      key: "bad-hours",
      title: `${name} gives money back between ${hourLabel(worstHour)}`,
      short: `trades through ${worstHour.label}`,
      detail: `${worstHour.trades} trades entered between ${hourLabel(worstHour)} netted ${fmtMoney(worstHour.net, { sign: true })} (${fmtPct(worstHour.winRate)} wins).`,
      cost: -worstHour.net,
      sample: worstHour.trades,
      confidence: confidence(worstHour.trades),
      evidence: [
        { label: `${worstHour.label} trades`, value: String(worstHour.trades) },
        { label: "Their net", value: fmtMoney(worstHour.net, { sign: true }), tone: "neg" },
      ],
      instruction: {
        obstacle: "bad-hours",
        ...orderText("bad-hours", { hour: Number(worstHour.key) }, name),
        backtest: findTest((o) => o.windowEnd != null),
        rulesPatch: null,
        checklist: `No new trades ${hourLabel(worstHour)}`,
      },
    });
  }

  // Sizing up after a loss.
  const upAfterLoss: Trade[] = [];
  for (const list of byDay.values()) {
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1]!.netPnl < 0 && list[i]!.qty > list[i - 1]!.qty) upAfterLoss.push(list[i]!);
    }
  }
  const upNet = upAfterLoss.reduce((a, t) => a + t.netPnl, 0);
  if (upAfterLoss.length >= 2 && upNet < 0) {
    const baseQty = median(trades.map((t) => t.qty)) ?? 1;
    stopping.push({
      key: "sizing-up",
      title: `${name} sizes up to win it back`,
      short: "sizes up after a loss",
      detail: `${upAfterLoss.length} times ${name} went bigger straight after a loss. Those trades netted ${fmtMoney(upNet, { sign: true })}.`,
      cost: -upNet,
      sample: upAfterLoss.length,
      confidence: confidence(upAfterLoss.length),
      evidence: [
        { label: "Size-ups after a loss", value: String(upAfterLoss.length) },
        { label: "Their net", value: fmtMoney(upNet, { sign: true }), tone: "neg" },
      ],
      instruction: {
        obstacle: "sizing-up",
        ...orderText("sizing-up", { qty: baseQty }, name),
        backtest: null,
        rulesPatch: r.maxContracts ? null : { maxContracts: Math.max(1, Math.round(baseQty * 2)) },
        checklist: "Never sized up after a loss",
      },
    });
  }

  // Trading unprepared.
  const preIds = settings.ritual.filter((i) => i.group === "pre").map((i) => i.id);
  const prepDays = days.filter((d) => prepared(journalByDay.get(d.day), preIds));
  const rawDays = days.filter((d) => !prepared(journalByDay.get(d.day), preIds));
  if (prepDays.length >= 3 && rawDays.length >= 3) {
    const avgP = prepDays.reduce((a, d) => a + d.net, 0) / prepDays.length;
    const avgR = rawDays.reduce((a, d) => a + d.net, 0) / rawDays.length;
    const gap = (avgP - avgR) * rawDays.length;
    if (avgP > avgR && gap > 0) {
      stopping.push({
        key: "unprepared",
        title: `${name} trades better prepared — and often isn't`,
        short: "skips the preparation",
        detail: `Prepared days average ${fmtMoney(avgP, { sign: true })}; unprepared days ${fmtMoney(avgR, { sign: true })}. ${rawDays.length} of ${tradeDays} trading days started unprepared.`,
        cost: gap,
        sample: tradeDays,
        confidence: confidence(tradeDays),
        evidence: [
          { label: "Prepared day", value: fmtMoney(avgP, { sign: true }), tone: avgP >= 0 ? "pos" : "neg" },
          { label: "Unprepared day", value: fmtMoney(avgR, { sign: true }), tone: avgR >= 0 ? "pos" : "neg" },
        ],
        instruction: {
          obstacle: "unprepared",
          ...orderText("unprepared", {}, name),
          backtest: null,
          rulesPatch: null,
          checklist: null,
        },
      });
    }
  }

  // The costliest repeated mistake tag.
  const mistakes = byMistake(trades).filter((b) => b.trades >= 3 && b.net < 0);
  const worstMistake = mistakes[0];
  if (worstMistake) {
    stopping.push({
      key: "mistakes",
      title: `${name} keeps making the “${worstMistake.label}” mistake`,
      short: `keeps repeating “${worstMistake.label}”`,
      detail: `Tagged ${worstMistake.trades} times, netting ${fmtMoney(worstMistake.net, { sign: true })}.`,
      cost: -worstMistake.net,
      sample: worstMistake.trades,
      confidence: confidence(worstMistake.trades),
      evidence: [
        { label: "Times tagged", value: String(worstMistake.trades) },
        { label: "Cost", value: fmtMoney(worstMistake.net, { sign: true }), tone: "neg" },
      ],
      instruction: {
        obstacle: "mistakes",
        ...orderText("mistakes", { label: worstMistake.label }, name),
        backtest: findTest((o) => o.skipMistakeTagged === true),
        rulesPatch: null,
        checklist: `No “${worstMistake.label}” today`,
      },
    });
  }

  // Fees eating the edge.
  if (s.gross > 0 && s.fees > s.gross * 0.3 && trades.length >= 10) {
    stopping.push({
      key: "fees",
      title: `Fees take ${fmtPct(s.fees / s.gross)} of ${name}'s gross profit`,
      short: "pays away the edge in fees",
      detail: `${fmtMoney(s.fees)} in fees on ${fmtMoney(s.gross)} gross. Fewer, better trades keep more of the edge.`,
      cost: s.fees,
      sample: trades.length,
      confidence: confidence(trades.length),
      evidence: [
        { label: "Fees", value: fmtMoney(s.fees), tone: "neg" },
        { label: "Gross", value: fmtMoney(s.gross, { sign: true }) },
      ],
      instruction: {
        obstacle: "fees",
        ...orderText("fees", { limit: r.maxTradesPerDay ?? 3 }, name),
        backtest: findTest((o) => o.maxTradesPerDay != null),
        rulesPatch: null,
        checklist: "Only took A+ setups",
      },
    });
  }

  stopping.sort((a, b) => b.cost - a.cost);
  const tell = stopping.slice(0, 3).map((o) => o.instruction);

  // ── Headline ─────────────────────────────────────────────────────────────
  // `headline` is plain (used across the app); `headlineMd` is the Observer's
  // longer read, with the obstacle phrase in *asterisks* for italics.
  let headline: string;
  let headlineMd: string;
  const top = stopping[0];
  if (!trades.length) {
    headline = `${name} hasn't traded in this window yet — the observer is waiting for evidence.`;
    headlineMd = `${name} hasn't traded in this window yet. The Observer is *waiting* for evidence.`;
  } else if (top && strengths[0]) {
    headline = `${name} has something that works — but ${top.short}, and it cost ${fmtMoney(top.cost)}.`;
    headlineMd = `${name} has an edge: ${strengths[0].clause}. But ${name} *${top.short}* — and that cost ${fmtMoney(top.cost)}.`;
  } else if (top) {
    headline = `${name} ${top.short} — that cost ${fmtMoney(top.cost)}.`;
    headlineMd = `${name} *${top.short}* — and that cost ${fmtMoney(top.cost)} in ${tradeDays} trading day${tradeDays === 1 ? "" : "s"}.`;
  } else if (s.net > 0) {
    headline = `${name} is trading cleanly. The job now is to keep doing exactly this.`;
    headlineMd = `${name} is trading *cleanly*. The job now is to keep doing exactly this.`;
  } else {
    headline = `${name} is breaking even — no single habit stands out yet; consistency comes first.`;
    headlineMd = `${name} is breaking even. No single habit stands out yet — *consistency* comes first.`;
  }

  return {
    name,
    from: input.from,
    to: input.to,
    sample: { trades: trades.length, days: tradeDays, low },
    headline,
    headlineMd,
    wants,
    doing,
    strengths: strengths.slice(0, 3).map(({ clause: _c, ...f }) => f),
    stopping,
    tell,
  };
}

/**
 * Compares what the trader believes is holding them back with what the data
 * says. The gap between the two is often the most useful thing to see.
 */
export function perceptionGap(believed: ObstacleKey[], dossier: ObserverDossier): PerceptionGap {
  const dataTop = dossier.stopping[0] ?? null;
  const ranks = believed.map((key) => {
    const i = dossier.stopping.findIndex((o) => o.key === key);
    return { key, rank: i >= 0 ? i + 1 : null, cost: i >= 0 ? dossier.stopping[i]!.cost : 0 };
  });
  const n = dossier.name;
  if (!believed.length) return { verdict: "unknown", believed, dataTop, ranks, message: "Pick what you think is stopping them to see whether the data agrees." };
  if (!dataTop) {
    return { verdict: "unknown", believed, dataTop, ranks, message: `There isn't enough evidence yet to confirm or contradict that. Keep logging — the observer needs more trades.` };
  }
  if (ranks.some((x) => x.rank === 1)) {
    return { verdict: "aligned", believed, dataTop, ranks, message: `You see ${n} clearly. The data agrees: ${dataTop.short} is the biggest leak (${fmtMoney(dataTop.cost)}). Knowing isn't the problem — doing is.` };
  }
  if (ranks.some((x) => x.rank !== null)) {
    const best = ranks.filter((x) => x.rank !== null).sort((a, b) => a.rank! - b.rank!)[0]!;
    return {
      verdict: "partial",
      believed, dataTop, ranks,
      message: `${OBSTACLE_LABELS[best.key]} is real (#${best.rank}, ${fmtMoney(best.cost)}) — but the bigger one is that ${n} ${dataTop.short} (${fmtMoney(dataTop.cost)}).`,
    };
  }
  return {
    verdict: "blind",
    believed, dataTop, ranks,
    message: `The data doesn't show that costing ${n} anything. What it does show: ${n} ${dataTop.short}, and it cost ${fmtMoney(dataTop.cost)}. That's the blind spot.`,
  };
}

/** Rounds dossier money for compact AI context. */
export function dossierForAi(d: ObserverDossier) {
  return {
    name: d.name,
    window: `${d.from} → ${d.to}`,
    sample: d.sample,
    headline: d.headline,
    wants: d.wants.map((w) => `${w.source}: ${w.text}`),
    doing: d.doing.map((f) => f.text),
    strengths: d.strengths.map((f) => f.text),
    stopping: d.stopping.slice(0, 6).map((o) => ({
      key: o.key, title: o.title, detail: o.detail, cost: r0(o.cost), confidence: o.confidence,
      instruction: `When ${o.instruction.when}, ${o.instruction.then}`,
      backtest: o.instruction.backtest ? { rule: o.instruction.backtest.label, wouldHaveAdded: r0(o.instruction.backtest.delta) } : null,
    })),
  };
}
