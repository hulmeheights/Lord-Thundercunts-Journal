import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { syncAll } from "@/lib/brokers/sync";

export const maxDuration = 60;

/** Manual "Sync now" and the quiet auto-sync when the app is opened. */
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { auto?: boolean; full?: boolean };
  const results = await syncAll({ full: body.full === true, staleMinutes: body.auto ? 10 : undefined });
  return NextResponse.json({ results });
}
