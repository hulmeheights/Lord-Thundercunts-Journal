import type { JournalDay, Settings, Trade } from "./types";
import { addDays, isWeekend, weekdayIndex, zonedToUtc } from "./analytics/time";

/**
 * Generates a realistic, deterministic sample history so every screen can be
 * explored before a broker is connected. Patterns are planted on purpose
 * (strong mornings, weak afternoons, revenge trades, a leaky setup) so the
 * insight engine has something real to find.
 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SETUP_EDGE: Record<string, number> = {
  "Opening Range Breakout": 0.6,
  "VWAP Reclaim": 0.57,
  "Trend Pullback": 0.52,
  "Liquidity Sweep": 0.44,
  "Range Fade": 0.36,
};

const NOTES_WIN = [
  "Waited for the retest. Clean execution, took partials at 1R.",
  "Patient entry at the level — let it come to me.",
  "Followed the plan exactly. This is the trade I want to repeat.",
  "Good read on the open, sized correctly.",
];
const NOTES_LOSS = [
  "Entered early before confirmation. Stop was right though.",
  "Chop. Should have sat on my hands.",
  "Took it out of boredom. Not in my plan.",
  "Valid setup, just didn't work. Fine loss.",
];

export function generateSample(today: string, settings: Settings): { trades: Trade[]; journals: JournalDay[] } {
  const tz = settings.profile.timezone;
  const r = rng(424242);
  const trades: Trade[] = [];
  const journals: JournalDay[] = [];
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!;
  const setups = Object.keys(SETUP_EDGE);

  const days: string[] = [];
  for (let d = addDays(today, -1); days.length < 48; d = addDays(d, -1)) if (!isWeekend(d)) days.push(d);
  days.reverse();

  let price = 21_150;
  for (const day of days) {
    const readiness = {
      sleep: 1 + Math.floor(r() * 5),
      energy: 2 + Math.floor(r() * 4),
      focus: 1 + Math.floor(r() * 5),
      mood: 2 + Math.floor(r() * 4),
    };
    const ready = (readiness.sleep + readiness.energy + readiness.focus + readiness.mood) / 4; // 1.5–5
    const friday = weekdayIndex(day) === 4;
    const tilted = ready < 2.75 || r() < 0.12;
    const count = Math.max(1, Math.round(2 + r() * 2 + (tilted ? 2 + r() * 2 : 0)));

    let minute = 9 * 60 + 33 + Math.floor(r() * 30);
    let lossStreak = 0;
    let prevQty = 1;
    let prevLoss = false;
    const dayTrades: Trade[] = [];

    for (let i = 0; i < count; i++) {
      const revenge: boolean = prevLoss && (tilted ? r() < 0.6 : r() < 0.2);
      if (i > 0) minute += revenge ? 1 + Math.floor(r() * 3) : 6 + Math.floor(r() * 40);
      if (minute > 15 * 60 + 30) break;
      const late = minute >= 11 * 60 + 30;
      const symbolRoll = r();
      const root = symbolRoll < 0.72 ? "MNQ" : symbolRoll < 0.92 ? "MES" : "NQ";
      const pv = root === "MNQ" ? 2 : root === "MES" ? 5 : 20;
      const feePerSide = root === "NQ" ? 1.4 : 0.37;
      const setup = pick(setups);
      let qty = root === "NQ" ? 1 : 2 + Math.floor(r() * 2);
      if (revenge) qty = Math.min(qty + 2, 6);
      const risk = 90 + r() * 70;
      let pWin: number = SETUP_EDGE[setup]! + (ready - 3) * 0.05 - (late ? 0.12 : 0) - (friday ? 0.07 : 0) - (revenge ? 0.18 : 0) - lossStreak * 0.04;
      pWin = Math.max(0.15, Math.min(0.8, pWin));
      const win: boolean = r() < pWin;
      const movedStop = !win && (revenge || tilted) && r() < 0.35;
      let pnl: number = win ? risk * (1.1 + r() * 1.6) : -risk * (movedStop ? 1.8 + r() * 0.8 : 0.7 + r() * 0.35);
      if (revenge) pnl *= qty / Math.max(1, prevQty);
      const direction = r() < 0.58 ? "long" : "short";
      const points: number = Math.round((pnl / (qty * pv)) * 4) / 4;
      const gross: number = points * qty * pv;
      const fees = Math.round(feePerSide * 2 * qty * 100) / 100;
      const basePx = root === "MES" ? price / 3.62 : price;
      const entryPrice = Math.round(basePx * 4) / 4;
      const exitPrice = direction === "long" ? entryPrice + points : entryPrice - points;
      const hold = win ? 2 + r() * 14 : movedStop ? 8 + r() * 25 : 1 + r() * 9;
      const entry = zonedToUtc(day, minute, tz);
      const exit = new Date(entry.getTime() + hold * 60_000);
      minute += Math.ceil(hold);

      const mistakes: string[] = [];
      if (movedStop) mistakes.push("Moved stop");
      if (revenge && r() < 0.7) mistakes.push("Revenge trade");
      if (late && !win && r() < 0.4) mistakes.push("No setup");
      if (revenge && qty > prevQty) mistakes.push("Oversized");
      const emotion = revenge ? pick(["Frustrated", "Anxious", "Greedy"]) : win ? pick(["Calm", "Focused", "Confident"]) : pick(["Calm", "Anxious", "Bored", "Focused"]);

      const net: number = Math.round((gross - fees) * 100) / 100;
      dayTrades.push({
        id: `sample:${day}:${i}`,
        source: "sample",
        accountId: null,
        symbol: `${root}Z6`,
        root,
        direction,
        qty,
        maxPosition: qty,
        entryTime: entry.toISOString(),
        exitTime: exit.toISOString(),
        entryPrice,
        exitPrice,
        grossPnl: Math.round(gross * 100) / 100,
        fees,
        netPnl: net,
        pointValue: pv,
        fillCount: 2,
        setup: r() < 0.9 ? setup : null,
        tags: [],
        mistakes,
        emotion: r() < 0.8 ? emotion : null,
        rating: win ? 4 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3),
        notes: r() < 0.35 ? pick(win ? NOTES_WIN : NOTES_LOSS) : null,
        plannedRisk: Math.round(risk),
        followedPlan: mistakes.length === 0,
        chartUrl: null,
      });

      prevLoss = net < 0;
      lossStreak = net < 0 ? lossStreak + 1 : 0;
      prevQty = qty;
    }
    price += (r() - 0.45) * 120;
    trades.push(...dayTrades);

    const pre = settings.ritual.filter((x) => x.group === "pre");
    const post = settings.ritual.filter((x) => x.group !== "pre");
    const checklist: Record<string, boolean> = {};
    for (const item of pre) checklist[item.id] = r() < (ready >= 3.5 ? 0.92 : 0.45);
    for (const item of post) checklist[item.id] = r() < 0.7;
    const net = dayTrades.reduce((s, t) => s + t.netPnl, 0);
    const wroteReview = r() < 0.75;
    journals.push({
      day,
      checklist,
      tasks: [],
      readiness,
      intention: r() < 0.7 ? pick(["Wait for my levels. No FOMO.", "Two trades max, then walk away.", "Trade the plan, not the P&L.", "Patience at the open."]) : null,
      plan: r() < 0.6 ? "Bias: neutral above VWAP. Watching ONH for a reclaim and PDL for a sweep. Max loss $600." : null,
      review: wroteReview
        ? net >= 0
          ? "Solid session. Stayed patient on the first setup and stopped when I was green."
          : "Gave back too much after the second loss. I knew I should stop and didn't."
        : null,
      wins: wroteReview && net >= 0 ? "Followed my entry rules on the first trade." : null,
      lessons: wroteReview && net < 0 ? "After two losses, the session is over. Non-negotiable." : null,
      moodAfter: net >= 0 ? 4 : 2,
      rulesKept: {},
      isSample: true,
    });
  }

  return { trades, journals };
}
