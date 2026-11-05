/**
 * MNQ SOR v2 (one alert, the bot decides per account). The script sends every
 * possible trade as {"event":"signal", …}; each account card decides for
 * itself (on your Mac) whether to take it. This file is the website's side:
 * reading the signal, and each card's settings with the tested defaults.
 * Pure, so it's unit-tested.
 */
import { z } from "zod";

const Px = z.number().finite().positive();
export const SorSignal = z.object({
  secret: z.string().max(200),
  event: z.literal("signal"),
  swing: z.enum(["3/3", "3/2"]),
  session: z.enum(["NYAM", "NYPM", "LON", "ASIA"]),
  dow: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
  mins_in: z.number().finite().min(0).max(2000),
  quiet: z.boolean(),
  dir: z.enum(["LONG", "SHORT"]),
  entry: Px,
  stop: Px,
  target: Px.nullable(),
  quiet_target: Px.nullable(),
  atr: z.number().finite().nullable().optional(),
  id: z.string().min(1).max(80),
});
export type SorSignal = z.infer<typeof SorSignal>;
/** What's kept of a signal: everything except the secret (never stored, logged or shown). */
export type StoredSignal = Omit<SorSignal, "secret">;
export const withoutSecret = ({ secret: _s, ...rest }: SorSignal): StoredSignal => rest;

/** The candle the signal fired on, from its id ("1762160520000-3/3-L" → that bar's open time). */
export function barTimeOf(id: string): Date | null {
  const ms = Number(id.split("-")[0]);
  return Number.isFinite(ms) && ms > 1.5e12 && ms < 4e12 ? new Date(ms) : null;
}

export type Phase = "eval" | "funded";
export type SorSession = "NYAM" | "NYPM" | "LON" | "ASIA";
export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
export type CardRules = {
  swing: "3/3" | "3/2";
  sessions: SorSession[];
  skipDays: Weekday[];
  windows: Record<SorSession, number>;
  quietMode: "target15" | "skip";
  minRR: number;
  maxTradesDay: number;
  maxTradesSession: number;
  weekRedDaysStop: number;
};

/** The tested defaults (spec: Account settings). Day target $1,600 and day loss −$500 live on the card itself. */
export const PHASE_DEFAULTS: Record<Phase, CardRules> = {
  eval: { swing: "3/3", sessions: ["NYAM", "NYPM", "LON"], skipDays: ["Thu"], windows: { NYAM: 90, NYPM: 90, LON: 120, ASIA: 120 }, quietMode: "target15", minRR: 1.8, maxTradesDay: 4, maxTradesSession: 1, weekRedDaysStop: 2 },
  funded: { swing: "3/2", sessions: ["NYAM", "NYPM", "LON", "ASIA"], skipDays: [], windows: { NYAM: 150, NYPM: 150, LON: 150, ASIA: 150 }, quietMode: "skip", minRR: 1.8, maxTradesDay: 4, maxTradesSession: 1, weekRedDaysStop: 2 },
};

const Sess = z.enum(["NYAM", "NYPM", "LON", "ASIA"]);
export const CardRulesSchema = z.object({
  swing: z.enum(["3/3", "3/2"]),
  sessions: z.array(Sess).max(4),
  skipDays: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri"])).max(5),
  windows: z.object({ NYAM: z.number().int().min(1).max(240), NYPM: z.number().int().min(1).max(240), LON: z.number().int().min(1).max(240), ASIA: z.number().int().min(1).max(240) }),
  quietMode: z.enum(["target15", "skip"]),
  minRR: z.number().min(0).max(10),
  maxTradesDay: z.number().int().min(1).max(20),
  maxTradesSession: z.number().int().min(1).max(10),
  weekRedDaysStop: z.number().int().min(1).max(5),
});

/** A card's rules: what's saved, filled in from its phase's defaults where missing or broken. */
export function rulesFor(phase: Phase, saved: unknown): CardRules {
  const base = PHASE_DEFAULTS[phase];
  const merged = { ...base, ...(saved && typeof saved === "object" ? saved : {}) } as Record<string, unknown>;
  merged.windows = { ...base.windows, ...((merged.windows as object) ?? {}) };
  const ok = CardRulesSchema.safeParse(merged);
  return ok.success ? ok.data : base;
}

/** The secret, wherever this kind of alert carries it: top level (signals) or inside "data" (older alerts). */
export function secretOf(body: unknown): string {
  if (typeof body !== "object" || !body) return "";
  const b = body as { secret?: unknown; data?: { secret?: unknown } };
  if (typeof b.secret === "string") return b.secret;
  return typeof b.data === "object" && b.data ? String(b.data.secret ?? "") : "";
}
