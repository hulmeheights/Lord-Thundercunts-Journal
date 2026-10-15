import { notFound, redirect } from "next/navigation";
import { isConfigured, aiConfigured } from "@/lib/env";
import { requireSession } from "@/lib/auth/session";
import { loadBriefing } from "@/lib/data/briefing";
import { PERIODS, type Period } from "@/lib/analytics/briefing";
import { StoryPlayer } from "@/components/briefing/StoryPlayer";

export const metadata = { title: "Briefing" };

export default async function BriefingPage({
  params,
  searchParams,
}: {
  params: Promise<{ period: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isConfigured()) redirect("/setup");
  await requireSession();
  const { period } = await params;
  if (!PERIODS.includes(period as Period)) notFound();
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const { settings, briefing } = await loadBriefing(period as Period, date);
  return (
    <StoryPlayer
      window={briefing.window}
      slides={briefing.slides}
      hash={briefing.hash}
      aiEnabled={aiConfigured() && settings.ai.enabled}
      date={date}
    />
  );
}
