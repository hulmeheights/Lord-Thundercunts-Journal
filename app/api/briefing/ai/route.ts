import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { aiBriefing } from "@/lib/ai/briefing";
import { aiErrorMessage } from "@/lib/ai/client";
import { loadBriefing } from "@/lib/data/briefing";
import { PERIODS, type Period } from "@/lib/analytics/briefing";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { period?: string; date?: string | null };
  const period = PERIODS.includes(body.period as Period) ? (body.period as Period) : null;
  if (!period) return NextResponse.json({ error: "Bad period" }, { status: 400 });

  const { settings, briefing } = await loadBriefing(period, body.date ?? null);
  if (!aiConfigured() || !settings.ai.enabled) {
    return NextResponse.json({ disabled: true });
  }
  try {
    const result = await aiBriefing(briefing.window.id, briefing.aiContext);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ briefing: result });
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 502 });
  }
}
