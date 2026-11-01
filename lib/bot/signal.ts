/**
 * Autopilot: the pure side of the TradingView → TopstepX bridge. Parses the
 * alert, names its session, works out the trading day (resets 18:00 New
 * York, like Topstep), bracket ticks, P&L and each account's daily gates.
 * No I/O, so every rule here is unit-tested.
 */
import { z } from "zod";
import { addDays, dayKey, minuteOfDay, zonedToUtc } from "../analytics/time";

export const NY = "America/New_York";
/** MNQ: $2 a point per contract, 4 ticks a point. */
export const DOLLARS_PER_POINT = 2;
export const TICKS_PER_POINT = 4;

const Px = z.coerce.number().finite().positive();
const Data = z.discriminatedUnion("event", [
  z.object({ event: z.literal("entry"), secret: z.string().max(200), dir: z.enum(["LONG", "SHORT"]), qty: z.coerce.number().int().positive().max(100).optional(), stop: Px, target: Px }),
  z.object({ event: z.literal("exit"), secret: z.string().max(200), dir: z.enum(["LONG", "SHORT"]) }),
  z.object({ event: z.literal("flatten"), secret: z.string().max(200) }),
]);
/** The alert message: {"price": {{strategy.order.price}}, "data": {{strategy.order.alert_message}}}. */
export const Alert = z.object({ price: Px, data: Data });
export type Alert = z.infer<typeof Alert>;

export type Session = "NYAM" | "NYPM" | "LON" | "ASIA" | "OTHER";
export const SESSION_LABEL: Record<Session, string> = { NYAM: "NY AM", NYPM: "NY PM", LON: "London", ASIA: "Asia", OTHER: "Outside a session" };
const SESSIONS: [Session, number, number][] = [
  ["NYAM", 9 * 60 + 30, 12 * 60],
  ["NYPM", 13 * 60 + 30, 15 * 60 + 55],
  ["LON", 3 * 60, 6 * 60],
  ["ASIA", 20 * 60, 24 * 60],
];
/** The session a moment falls in, by New York time (the script's own windows). */
export function sessionOf(at: Date | string): Session {
  const m = minuteOfDay(typeof at === "string" ? at : at.toISOString(), NY);
  return SESSIONS.find(([, a, b]) => m >= a && m < b)?.[0] ?? "OTHER";
}

/** When the current trading day began: 18:00 New York, the same reset as Topstep's. */
export function tradingDayStart(now: Date): Date {
  const day = dayKey(now, NY);
  const sixToday = zonedToUtc(day, 18 * 60, NY);
  return now >= sixToday ? sixToday : zonedToUtc(addDays(day, -1), 18 * 60, NY);
}

/** Bracket distances in ticks from the signal price (at least 1). */
export function bracketTicks(price: number, stop: number, target: number) {
  return {
    stopTicks: Math.max(1, Math.round(Math.abs(price - stop) * TICKS_PER_POINT)),
    targetTicks: Math.max(1, Math.round(Math.abs(target - price) * TICKS_PER_POINT)),
  };
}

/** A sane bracket: stop on the losing side, target on the winning side. */
export function bracketOk(dir: "LONG" | "SHORT", price: number, stop: number, target: number): string | null {
  if (dir === "LONG" && !(stop < price && target > price)) return "stop must be below and target above the price for a long";
  if (dir === "SHORT" && !(stop > price && target < price)) return "stop must be above and target below the price for a short";
  return null;
}

export function pnlOf(dir: "LONG" | "SHORT", entry: number, exit: number, qty: number): number {
  return Math.round((exit - entry) * (dir === "LONG" ? 1 : -1) * DOLLARS_PER_POINT * qty * 100) / 100;
}

export type BotAccount = {
  id: string;
  label: string;
  topstepAccountId: string | null;
  contracts: number;
  maxDailyLoss: number;
  maxDailyWin: number | null;
  enabled: boolean;
  /** Account profit target (e.g. 3000 to pass a 50K Combine); null = run as long as you like. */
  profitTarget: number | null;
  /** The account's starting balance, so profit = balance − start. */
  startBalance: number;
};

/** Has the account made its profit target? Profit is its balance above the start (or, on paper, the paper P&L). */
export const targetReached = (a: Pick<BotAccount, "profitTarget">, profit: number) => a.profitTarget != null && profit >= a.profitTarget;

/** Why an account sits a signal out today, or null if it can trade. */
export function gate(a: BotAccount, dayPnl: number): string | null {
  if (a.maxDailyWin != null && dayPnl >= a.maxDailyWin) return `max daily win reached (${dayPnl >= 0 ? "+" : "−"}$${Math.abs(dayPnl).toFixed(0)})`;
  if (dayPnl <= -a.maxDailyLoss) return `daily loss limit hit (−$${Math.abs(dayPnl).toFixed(0)})`;
  return null;
}

/** The exact alert message to paste into TradingView. */
export const ALERT_MESSAGE = '{"price": {{strategy.order.price}}, "data": {{strategy.order.alert_message}}}';
