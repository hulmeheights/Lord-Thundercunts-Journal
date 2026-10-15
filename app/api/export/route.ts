import { NextResponse } from "next/server";
import { assertSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** Full personal data export (never includes credentials or tokens). */
export async function GET() {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sql = await db();
  const [trades, journal, settings, capsules, accounts] = await Promise.all([
    sql`select * from trades order by exit_time`,
    sql`select * from journal_days order by day`,
    sql`select key, value from app_settings`,
    sql`select id, message, created_at, deliver_on, opened_at from capsules`,
    sql`select id, provider, name, is_sim, active, included from broker_accounts`,
  ]);
  const payload = { exportedAt: new Date().toISOString(), trades, journal, settings, capsules, accounts };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="ltj-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
