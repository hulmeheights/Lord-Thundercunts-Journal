import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { aiCaseFile } from "@/lib/ai/observer";
import { aiErrorMessage } from "@/lib/ai/client";
import { dossierForAi, OBSTACLE_LABELS } from "@/lib/analytics/observer";
import { daysBetween } from "@/lib/analytics/time";
import { getObserverSession, loadDossier, saveObserverAi } from "@/lib/data/observer";
import { getSettings } from "@/lib/data/settings";

export const maxDuration = 300;

const Body = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  regenerate: z.boolean().optional(),
});

/** Writes (once) and returns the AI case file for a saved Observer session. */
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getSettings();
  if (!aiConfigured() || !settings.ai.enabled) return NextResponse.json({ disabled: true });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad session" }, { status: 400 });
  const { id, regenerate } = parsed.data;
  const session = await getObserverSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.ai && regenerate !== true) return NextResponse.json({ caseFile: session.ai });

  const window = daysBetween(session.from, session.to) + 1 > 45 ? 90 : 30;
  const { dossier } = await loadDossier(window, session.wants);
  try {
    const result = await aiCaseFile({
      name: dossier.name,
      pronoun: settings.observer.pronoun,
      dossier: dossierForAi(dossier),
      written: {
        wants: session.wants,
        doing: session.doing,
        stopping: session.stopping,
        advice: session.advice,
        believed: session.believed.map((k) => OBSTACLE_LABELS[k]),
      },
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
    await saveObserverAi(id, result);
    return NextResponse.json({ caseFile: result });
  } catch (err) {
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 502 });
  }
}
