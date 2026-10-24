import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { syncAll } from "@/lib/brokers/sync";
import { sendDueReminders } from "@/lib/data/reminders";

export const maxDuration = 60;

/**
 * Hourly sync triggered by Vercel Cron (see vercel.json: one daily job per
 * hour, which Hobby allows). Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * without CRON_SECRET set this endpoint refuses every request. After syncing it
 * sends whatever phone reminders are due, so rule alerts see the newest trades.
 */
export async function GET(request: Request) {
  const secret = env.cronSecret;
  const header = request.headers.get("authorization") || "";
  if (secret.length < 16 || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Skip connections synced in the last 45 minutes (opening the app syncs too).
  const results = await syncAll({ staleMinutes: 45 });
  const reminders = await sendDueReminders().catch(() => null);
  return NextResponse.json({ ok: true, reminders, results: results.map((r) => ({ connection: r.connection, ok: r.ok, newFills: r.newFills ?? 0 })) });
}
