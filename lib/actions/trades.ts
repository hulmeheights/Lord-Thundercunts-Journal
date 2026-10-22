"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { assertSession } from "../auth/session";
import { deleteTrade, EDITABLE_SOURCES, getTrade, insertTrades, updateTradeCore, updateTradeJournal, type TradeCore } from "../data/trades";
import { pointValueFor, rootFromSymbol } from "../brokers/contracts";
import { getSettings } from "../data/settings";
import { zonedToUtc } from "../analytics/time";
import type { Trade } from "../types";

const Patch = z
  .object({
    setups: z.array(z.string().max(80)).max(20),
    tags: z.array(z.string().max(40)).max(20),
    mistakes: z.array(z.string().max(40)).max(20),
    emotion: z.string().max(40).nullable(),
    rating: z.number().int().min(1).max(5).nullable(),
    notes: z.string().max(10_000).nullable(),
    plannedRisk: z.number().positive().max(1_000_000).nullable(),
    followedPlan: z.boolean().nullable(),
    chartUrl: z
      .string()
      .max(500)
      .refine((s) => /^https:\/\//.test(s), "Must be an https link")
      .nullable(),
  })
  .partial();

export async function saveTradeJournal(id: string, patch: z.input<typeof Patch>) {
  await assertSession();
  await updateTradeJournal(z.string().max(200).parse(id), Patch.parse(patch));
  revalidatePath("/", "layout");
  return { ok: true };
}

const Manual = z.object({
  symbol: z.string().trim().min(1).max(20),
  direction: z.enum(["long", "short"]),
  qty: z.number().positive().max(1000),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entryTime: z.string().regex(/^\d{2}:\d{2}$/),
  exitTime: z.string().regex(/^\d{2}:\d{2}$/),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive(),
  fees: z.number().min(0).max(100_000),
  pointValue: z.number().positive().max(10_000_000).nullable(),
  setups: z.array(z.string().max(80)).max(20),
});

/** The trade's own figures, worked out from what was typed (times are in your timezone). */
function coreFrom(v: z.output<typeof Manual>, tz: string): TradeCore | { error: string } {
  const symbol = v.symbol.toUpperCase();
  const root = rootFromSymbol(symbol);
  const pv = v.pointValue ?? pointValueFor(root);
  if (!pv) return { error: `Unknown contract ${root} — enter its $ value per point.` };
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const entry = zonedToUtc(v.day, toMin(v.entryTime), tz);
  let exit = zonedToUtc(v.day, toMin(v.exitTime), tz);
  if (exit < entry) exit = new Date(exit.getTime() + 86_400_000);
  const points = v.direction === "long" ? v.exitPrice - v.entryPrice : v.entryPrice - v.exitPrice;
  const gross = Math.round(points * v.qty * pv * 100) / 100;
  return {
    symbol, root, direction: v.direction, qty: v.qty, maxPosition: v.qty, entryTime: entry.toISOString(), exitTime: exit.toISOString(),
    entryPrice: v.entryPrice, exitPrice: v.exitPrice, grossPnl: gross, fees: v.fees, netPnl: Math.round((gross - v.fees) * 100) / 100, pointValue: pv,
  };
}

export async function addManualTrade(input: z.input<typeof Manual>): Promise<{ id?: string; error?: string }> {
  await assertSession();
  const parsed = Manual.safeParse(input);
  if (!parsed.success) return { error: "Check the trade details." };
  const v = parsed.data;
  const settings = await getSettings();
  const core = coreFrom(v, settings.profile.timezone);
  if ("error" in core) return core;
  const t: Trade = {
    id: `manual:${randomUUID()}`, source: "manual", accountId: null, ...core, fillCount: 2, setups: v.setups, tags: [], mistakes: [],
    emotion: null, rating: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
  };
  await insertTrades([t]);
  revalidatePath("/", "layout");
  return { id: t.id };
}

export async function removeTrade(id: string) {
  await assertSession();
  await deleteTrade(z.string().max(200).parse(id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Correct a trade you typed in or imported: contracts, prices, times, fees. Your notes and tags stay. */
export async function editTrade(id: string, input: z.input<typeof Manual>): Promise<{ ok?: true; error?: string }> {
  await assertSession();
  const tid = z.string().max(200).parse(id);
  const current = await getTrade(tid);
  if (!current) return { error: "That trade no longer exists." };
  if (!EDITABLE_SOURCES.includes(current.source)) return { error: "Synced trades come from the broker's fills and can't be edited here." };
  const parsed = Manual.safeParse(input);
  if (!parsed.success) return { error: "Check the trade details." };
  const settings = await getSettings();
  const core = coreFrom(parsed.data, settings.profile.timezone);
  if ("error" in core) return core;
  await updateTradeCore(tid, core);
  revalidatePath("/", "layout");
  return { ok: true };
}
