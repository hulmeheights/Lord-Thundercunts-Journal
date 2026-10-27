"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { db } from "../db";
import { sha256 } from "../crypto";
import { insertTrades } from "../data/trades";
import { parseProjectXContractId, pointValueFor, rootFromSymbol } from "../brokers/contracts";
import { rebuildTrades } from "../brokers/sync";
import type { Trade } from "../types";

const Iso = z.string().datetime({ offset: true });
const TradeItem = z.object({
  kind: z.literal("trade"),
  key: z.string().min(1).max(400),
  symbol: z.string().min(1).max(60),
  direction: z.enum(["long", "short"]),
  qty: z.number().positive().max(100_000),
  entryTime: Iso,
  exitTime: Iso,
  entryPrice: z.number().finite(),
  exitPrice: z.number().finite(),
  grossPnl: z.number().finite().nullable(),
  fees: z.number().min(0).max(1_000_000),
  account: z.string().max(120).nullable(),
});
const FillItem = z.object({
  kind: z.literal("fill"),
  key: z.string().min(1).max(400),
  symbol: z.string().min(1).max(60),
  side: z.enum(["buy", "sell"]),
  qty: z.number().positive().max(100_000),
  price: z.number().finite(),
  time: Iso,
  fees: z.number().min(0).max(1_000_000),
  account: z.string().max(120).nullable(),
});
const Payload = z.object({
  accountLabel: z.string().trim().min(1).max(80),
  pointValues: z.record(z.string().max(20), z.number().positive().max(10_000_000)).default({}),
  items: z.array(z.discriminatedUnion("kind", [TradeItem, FillItem])).min(1).max(1000),
});

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "account";
}

function resolveSymbol(raw: string): { symbol: string; root: string } {
  const s = raw.trim();
  if (/^CON\.F\./i.test(s)) {
    const p = parseProjectXContractId(s);
    return { symbol: p.symbol, root: p.root };
  }
  const symbol = s.toUpperCase().replace(/\s+/g, "");
  return { symbol, root: rootFromSymbol(symbol.replace(/^[/@]/, "")) };
}

export type ImportResult = { ok?: boolean; added?: number; duplicates?: number; unknownRoots?: string[]; error?: string };

/**
 * Imports one chunk of a parsed export. Every row gets a deterministic ID, so
 * importing the same file twice never creates duplicates.
 */
export async function importChunk(input: z.input<typeof Payload>): Promise<ImportResult> {
  await assertSession();
  const parsed = Payload.safeParse(input);
  if (!parsed.success) return { error: "Some rows didn't look right. Check the column mapping." };
  const { items, pointValues } = parsed.data;

  // Each export row may name its own account; otherwise use the label chosen in the importer.
  const accountIdFor = (name: string | null) => `import:${slug(name || parsed.data.accountLabel)}`;
  const accounts = new Map<string, string>();
  for (const it of items) accounts.set(accountIdFor(it.account), it.account || parsed.data.accountLabel);

  const pv = (root: string) => pointValues[root] ?? pointValueFor(root);
  const unknown = new Set<string>();
  for (const it of items) {
    const { root } = resolveSymbol(it.symbol);
    const needsPv = it.kind === "fill" || it.grossPnl === null;
    if (needsPv && !pv(root)) unknown.add(root);
  }
  if (unknown.size) return { unknownRoots: [...unknown] };

  const sql = await db();
  for (const [id, name] of accounts) {
    await sql`
      insert into broker_accounts (id, provider, external_id, name, is_sim, balance, active)
      values (${id}, 'import', ${id.slice(7)}, ${name}, false, null, true)
      on conflict (id) do nothing
    `;
  }

  const trades: Trade[] = [];
  const fillRows: Record<string, unknown>[] = [];
  for (const it of items) {
    const accountId = accountIdFor(it.account);
    const { symbol, root } = resolveSymbol(it.symbol);
    const id = `${accountId}:${sha256(`${accountId}|${it.key}`).slice(0, 24)}`;
    if (it.kind === "trade") {
      const pointValue = pv(root) ?? 1;
      const points = it.direction === "long" ? it.exitPrice - it.entryPrice : it.entryPrice - it.exitPrice;
      const gross = it.grossPnl ?? Math.round(points * it.qty * pointValue * 100) / 100;
      const [entryTime, exitTime] = it.entryTime <= it.exitTime ? [it.entryTime, it.exitTime] : [it.exitTime, it.entryTime];
      trades.push({
        id, source: "import", accountId, symbol, root, direction: it.direction, qty: it.qty, maxPosition: it.qty,
        entryTime: new Date(entryTime).toISOString(), exitTime: new Date(exitTime).toISOString(),
        entryPrice: it.entryPrice, exitPrice: it.exitPrice, grossPnl: gross, fees: it.fees,
        netPnl: Math.round((gross - it.fees) * 100) / 100, pointValue, fillCount: 2, setups: [], tags: [], mistakes: [],
        emotion: null, rating: null, grade: null, notes: null, plannedRisk: null, followedPlan: null, chartUrl: null,
      });
    } else {
      fillRows.push({
        id, provider: "import", account_id: accountId, contract_id: symbol, symbol, side: it.side, qty: it.qty, price: it.price,
        ts: new Date(it.time).toISOString(), fees: it.fees, broker_pnl: null, point_value: pv(root) ?? 1,
      });
    }
  }

  let added = 0;
  if (trades.length) {
    const before = await sql<{ n: number }[]>`select count(*)::int as n from trades where id = any(${sql.array(trades.map((t) => t.id))}::text[])`;
    await insertTrades(trades);
    added += trades.length - (before[0]?.n ?? 0);
  }
  if (fillRows.length) {
    const res = await sql<{ id: string }[]>`insert into fills ${sql(fillRows as never[])} on conflict (id) do nothing returning id`;
    added += res.length;
    const touched = [...new Set(fillRows.map((f) => String(f.account_id)))];
    await rebuildTrades("import", touched);
  }

  revalidatePath("/", "layout");
  return { ok: true, added, duplicates: items.length - added };
}
