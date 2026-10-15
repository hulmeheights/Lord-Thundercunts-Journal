import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { aiReflection } from "@/lib/ai/briefing";
import { aiErrorMessage } from "@/lib/ai/client";
import { getJournalDay } from "@/lib/data/journal";
import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { addDays, dayKey, timeInTz } from "@/lib/analytics/time";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getSettings();
  if (!aiConfigured() || !settings.ai.enabled) return NextResponse.json({ disabled: true });
  const body = (await request.json().catch(() => ({}))) as { day?: string };
  const day = typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null;
  if (!day) return NextResponse.json({ error: "Bad day" }, { status: 400 });

  const tz = settings.profile.timezone;
  const [journal, trades] = await Promise.all([
    getJournalDay(day),
    listTrades({ since: new Date(`${addDays(day, -1)}T00:00:00Z`), until: new Date(`${addDays(day, 2)}T00:00:00Z`) }),
  ]);
  const dayTrades = trades.filter((t) => dayKey(t.exitTime, tz) === day);
  try {
    const result = await aiReflection({
      day,
      journal: {
        readiness: journal.readiness,
        intention: journal.intention,
        plan: journal.plan,
        review: journal.review,
        wins: journal.wins,
        lessons: journal.lessons,
        moodAfter: journal.moodAfter,
      },
      trades: dayTrades.map((t) => ({
        time: timeInTz(t.entryTime, tz), symbol: t.root, dir: t.direction, qty: t.qty, net: Math.round(t.netPnl),
        setup: t.setup, mistakes: t.mistakes, emotion: t.emotion, note: t.notes?.slice(0, 160) ?? null,
      })),
      net: Math.round(dayTrades.reduce((s, t) => s + t.netPnl, 0)),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ reflection: result });
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 502 });
  }
}
