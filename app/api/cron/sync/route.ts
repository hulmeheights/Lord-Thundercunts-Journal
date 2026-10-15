import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { syncAll } from "@/lib/brokers/sync";

export const maxDuration = 60;

/**
 * Nightly sync triggered by Vercel Cron (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set this endpoint
 * refuses every request.
 */
export async function GET(request: Request) {
  const secret = env.cronSecret;
  const header = request.headers.get("authorization") || "";
  if (secret.length < 16 || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await syncAll();
  return NextResponse.json({ ok: true, results: results.map((r) => ({ connection: r.connection, ok: r.ok, newFills: r.newFills ?? 0 })) });
}
