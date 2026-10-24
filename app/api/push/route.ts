import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { pushAll, removeSubscription, saveSubscription, subscriptionCount, vapidKeys } from "@/lib/push";

/** Signed-in only; changes must also come from this site (browsers omit Origin on same-origin GETs). */
async function guard(write = true) {
  try {
    if (write) await assertSameOrigin();
    await assertSession();
    return null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** The public key a device needs to subscribe, and how many are subscribed. */
export async function GET() {
  const denied = await guard(false);
  if (denied) return denied;
  return NextResponse.json({ publicKey: vapidKeys().publicKey, devices: await subscriptionCount() });
}

const Sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https only"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Subscribe this device, or send a test with { test: true }. */
export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { subscription?: unknown; device?: unknown; test?: unknown };
  if (body.test === true) {
    const r = await pushAll({ title: "Thunder ◆", body: "Notifications are on. This is what a reminder looks like.", url: "/", tag: "test" });
    return NextResponse.json(r);
  }
  const sub = Sub.safeParse(body.subscription);
  if (!sub.success) return NextResponse.json({ error: "That subscription doesn't look right." }, { status: 400 });
  const device = typeof body.device === "string" ? body.device.slice(0, 120) : null;
  await saveSubscription(sub.data, device);
  return NextResponse.json({ ok: true });
}

/** Unsubscribe this device. */
export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof body.endpoint !== "string" || body.endpoint.length > 1000) return NextResponse.json({ error: "Bad endpoint" }, { status: 400 });
  await removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
