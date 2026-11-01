import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { claimTickets, expireTickets, napSeconds, runnerAuthed } from "@/lib/bot/runner";
import { logEvent } from "@/lib/bot/engine";
import { telegram } from "@/lib/bot/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Mac asks for order tickets here. Outside the sessions it's told to nap
 * until shortly before the next one; inside, while Autopilot is live, the line
 * is held open for up to 20 seconds so a ticket reaches it within half a second.
 */
export async function GET(req: Request) {
  const now = new Date();
  const nap = napSeconds(now);
  if (!(await runnerAuthed(req.headers.get("authorization")))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const sql = await db();
  const info = (req.headers.get("x-runner") ?? "").slice(0, 120) || null;
  await sql`update bot_runner set last_seen = now(), info = coalesce(${info}, info) where id = 1`;
  if (nap > 0) return NextResponse.json({ orders: [], wait: nap });
  const [{ mode }] = await sql<{ mode: string }[]>`select mode from bot_settings where id = 1`;
  if (mode !== "live") return NextResponse.json({ orders: [], wait: 20 });
  await expireTickets();
  for (let waited = 0; waited < 20_000; waited += 400) {
    const orders = await claimTickets();
    if (orders.length) return NextResponse.json({ orders, wait: 0 });
    await sleep(400);
  }
  await sql`update bot_runner set last_seen = now() where id = 1`;
  return NextResponse.json({ orders: [], wait: 0 });
}

const Report = z.object({ id: z.string().regex(/^bo_[A-Za-z0-9_-]{6,40}$/), ok: z.boolean(), orderId: z.string().max(40).optional(), error: z.string().max(500).optional() });

/** The Mac reports each ticket: placed (with Topstep's order id) or failed. */
export async function POST(req: Request) {
  if (!(await runnerAuthed(req.headers.get("authorization")))) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const parsed = Report.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad report" }, { status: 400 });
  const r = parsed.data;
  const sql = await db();
  const [o] = await sql<{ trade_id: string; account_label: string }[]>`
    update bot_orders set status = ${r.ok ? "placed" : "failed"}, order_id = ${r.orderId ?? null}, error = ${r.error ?? null}, done_at = now()
    where id = ${r.id} and status in ('claimed', 'expired') returning trade_id, account_label
  `;
  if (!o) return NextResponse.json({ ok: true, ignored: true });
  if (r.ok) {
    await sql`update bot_trades set status = 'open', reason = null, order_id = ${r.orderId ?? null} where id = ${o.trade_id}`;
  } else {
    await sql`update bot_trades set status = 'error', reason = ${`order failed on your Mac: ${r.error ?? "unknown error"}`} where id = ${o.trade_id}`;
    await logEvent("error", `Order failed on ${o.account_label} (from your Mac): ${r.error ?? "unknown error"}`);
    await telegram(`ORDER FAILED on ${o.account_label}: ${r.error ?? "unknown error"}. Check TopstepX.`);
  }
  return NextResponse.json({ ok: true });
}
