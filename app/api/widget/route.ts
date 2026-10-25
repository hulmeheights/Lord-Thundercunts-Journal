import { NextResponse } from "next/server";
import { checkWidgetToken, widgetFeed } from "@/lib/data/widget";

export const dynamic = "force-dynamic";

/**
 * The phone widget's feed (Scriptable). Read-only, keyed by a widget token sent
 * as a Bearer header, and limited to today's quote, window and streak: it can
 * never reach trades, money, accounts or broker connections.
 */
export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(await checkWidgetToken(token))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await widgetFeed(), { headers: { "cache-control": "no-store" } });
}
