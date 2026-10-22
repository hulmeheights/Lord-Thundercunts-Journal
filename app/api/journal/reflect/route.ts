import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { aiReflection } from "@/lib/ai/briefing";
import { aiErrorMessage } from "@/lib/ai/client";
import { getSettings } from "@/lib/data/settings";
import { deleteReflection, reflectionContext, saveReflection } from "@/lib/data/reflections";

export const maxDuration = 300;

async function guard() {
  try {
    await assertSameOrigin();
    await assertSession();
    return null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Read the day back, and keep what the coach said. */
export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const settings = await getSettings();
  if (!aiConfigured() || !settings.ai.enabled) return NextResponse.json({ disabled: true });
  const body = (await request.json().catch(() => ({}))) as { day?: string };
  const day = typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null;
  if (!day) return NextResponse.json({ error: "Bad day" }, { status: 400 });

  const { context, hash } = await reflectionContext(day);
  try {
    const result = await aiReflection(context);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
    const saved = await saveReflection(day, result, hash);
    return NextResponse.json({ reflection: result, saved });
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 502 });
  }
}

/** Forget one saved reflection. */
export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^ref_[A-Za-z0-9_-]{1,40}$/.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  return NextResponse.json({ ok: await deleteReflection(id) });
}
