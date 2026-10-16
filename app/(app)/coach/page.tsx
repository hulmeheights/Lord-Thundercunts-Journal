import { aiConfigured } from "@/lib/env";
import { getSettings } from "@/lib/data/settings";
import { CoachChat } from "@/components/coach/CoachChat";
import { Empty, LinkBtn, PageHead } from "@/components/m";

export const metadata = { title: "Coach" };

export default async function CoachPage() {
  const settings = await getSettings();
  const ready = aiConfigured() && settings.ai.enabled;
  return (
    <>
      <PageHead
        eyebrow="Thunder · your private coach"
        title={
          <>
            Ask the <em>hard</em> questions.
          </>
        }
        sub="It has read every trade, rule break and journal page from the last ninety days. It won't flatter you."
      />
      {ready ? (
        <CoachChat />
      ) : (
        <Empty
          title={aiConfigured() ? <>The coach is <em>resting</em>.</> : <>The coach needs a <em>key</em>.</>}
          action={<LinkBtn href="/settings#ai">{aiConfigured() ? "Switch it on" : "Open settings"}</LinkBtn>}
        >
          {aiConfigured()
            ? "AI is switched off in Settings."
            : "Create a key at console.anthropic.com, add it to Vercel as ANTHROPIC_API_KEY (tick Sensitive) and redeploy. The coach, the replays' narration and the Observer's voice all switch on."}
        </Empty>
      )}
    </>
  );
}
