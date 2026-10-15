import { Sparkles } from "lucide-react";
import { aiConfigured } from "@/lib/env";
import { getSettings } from "@/lib/data/settings";
import { Card, PageHeader } from "@/components/ui/Card";
import { CoachChat } from "@/components/coach/CoachChat";

export const metadata = { title: "Coach" };

export default async function CoachPage() {
  const settings = await getSettings();
  const ready = aiConfigured() && settings.ai.enabled;
  return (
    <>
      <PageHeader eyebrow="Thunder · your private AI coach" title="Coach" />
      {ready ? (
        <CoachChat />
      ) : (
        <Card className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[3px] bg-purple/15 text-purple">
            <Sparkles size={28} />
          </div>
          <h2 className="title-lg">Switch on your AI coach</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">
            {aiConfigured()
              ? "AI is turned off in Settings."
              : "Create an API key at console.anthropic.com, add it to Vercel as ANTHROPIC_API_KEY (Sensitive), and redeploy. Thunder will then write your briefings, reflect on your journal and answer anything about your trading."}
          </p>
        </Card>
      )}
    </>
  );
}
