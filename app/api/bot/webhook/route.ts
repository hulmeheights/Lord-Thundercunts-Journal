import { after, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { Alert } from "@/lib/bot/signal";
import { handleAlert, logEvent } from "@/lib/bot/engine";
import { webhookSecret } from "@/lib/bot/config";

export const dynamic = "force-dynamic";
// Orders on several accounts can take a few seconds; they run after the reply (below).
export const maxDuration = 60;

/**
 * TradingView → Autopilot. Public (TradingView can't log in), so the shared
 * secret inside the alert is the lock: compared in constant time, and the
 * body is capped and validated before anything else happens.
 */
export async function POST(req: Request) {
  const secret = webhookSecret();
  if (secret.length < 16) return NextResponse.json({ ok: false, error: "Autopilot isn't set up" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 4000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const given = typeof body === "object" && body && "data" in body && typeof (body as { data: unknown }).data === "object" ? String(((body as { data: { secret?: unknown } }).data?.secret ?? "")) : "";
  if (!safeEqual(given, secret)) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = Alert.safeParse(body);
  if (!parsed.success) {
    await logEvent("error", `Alert didn't look right: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    return NextResponse.json({ ok: false, error: "bad alert" }, { status: 400 });
  }
  // TradingView gives up on a webhook after about 3 seconds, so reply at once and do the work straight after.
  const received = new Date();
  after(async () => {
    try {
      await handleAlert(raw, parsed.data, received);
    } catch (e) {
      await logEvent("error", `Webhook error: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
    }
  });
  return NextResponse.json({ ok: true, received: received.toISOString() });
}
