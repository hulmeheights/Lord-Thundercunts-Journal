import { cookies } from "next/headers";
import { requireSession, listSessions } from "@/lib/auth/session";
import { listPasskeys } from "@/lib/auth/passkeys";
import { aiConfigured, env } from "@/lib/env";
import { getSettings } from "@/lib/data/settings";
import { listBrokerAccounts, listConnections } from "@/lib/data/connections";
import { tradeCounts } from "@/lib/data/trades";
import { lockNow } from "@/lib/actions/auth";
import { parseUiPrefs, UI_COOKIE } from "@/lib/ui-prefs";
import { Button } from "@/components/ui/Button";
import { Connections, type ConnectNotice } from "@/components/settings/Connections";
import { AiToggle, ProfileForm, RitualEditor, RulesForm, VocabEditor } from "@/components/settings/Forms";
import { Security } from "@/components/settings/Security";
import { DataControls } from "@/components/settings/DataControls";
import { Appearance } from "@/components/settings/Appearance";
import { Dot, PageHead, Section } from "@/components/m";
import { SectionIndex } from "@/components/m/SectionIndex";

export const metadata = { title: "Settings" };

const SECTIONS = ["connections", "rules", "ritual", "tags", "appearance", "security", "ai", "profile", "data"];

function noticeFrom(sp: Record<string, string | string[] | undefined>): ConnectNotice {
  const k = sp.tradovate;
  if (k !== "connected" && k !== "cancelled" && k !== "expired" && k !== "error") return null;
  const n = Number(sp.n);
  const msg = typeof sp.msg === "string" ? sp.msg.slice(0, 240) : undefined;
  return { kind: k, n: Number.isFinite(n) ? n : undefined, msg };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const [settings, connections, accounts, passkeys, sessions, counts, sp, jar] = await Promise.all([
    getSettings(),
    listConnections(),
    listBrokerAccounts(),
    listPasskeys(),
    listSessions(session.id),
    tradeCounts(),
    searchParams,
    cookies(),
  ]);
  const prefs = parseUiPrefs(jar.get(UI_COOKIE)?.value);
  const nightly = env.cronSecret.length >= 16;

  return (
    <>
      <SectionIndex ids={SECTIONS} />
      <PageHead
        eyebrow="Make it yours"
        title={
          <>
            The quiet <em>controls</em>.
          </>
        }
        sub="Where the trades come from, the rules they're judged by, and who gets to open the door. Only you."
        meta={
          <div className="font-mono text-[9.5px] leading-[2] tracking-[0.3em] text-ink-4 uppercase">
            <div>
              <Dot className="mr-2" /> <span className="text-pos">Locked to you</span>
            </div>
            <div>
              {passkeys.length} passkey{passkeys.length === 1 ? "" : "s"} · {sessions.length} device{sessions.length === 1 ? "" : "s"}
            </div>
          </div>
        }
      >
        <form action={lockNow}>
          <Button type="submit">Lock now</Button>
        </form>
      </PageHead>

      <Section
        id="connections"
        n={1}
        label="Connections"
        lead={
          <>
            Trades arrive <em>on their own</em>.
          </>
        }
        aside={<span className="eyebrow">{nightly ? "Nightly sync · on" : "Syncs when you open it"}</span>}
      >
        <Connections connections={connections} accounts={accounts} notice={noticeFrom(sp)} />
        {!nightly && (
          <p className="mt-8 max-w-[60ch] font-mono text-[10.5px] leading-[1.8] text-ink-4">
            Add CRON_SECRET in Vercel to switch on the nightly sync after the close. Until then it syncs whenever you open the journal.
          </p>
        )}
      </Section>

      <Section id="rules" n={2} label="Trading rules" lead={<>The rules you <em>said</em> you&apos;d keep.</>}>
        <p className="reveal -mt-8 mb-12 max-w-[56ch] font-mono text-[11.5px] leading-[1.9] text-ink-3">
          Checked automatically against every synced trade. Guardian, the report card, the Observer and the Rule Lab all read them.
        </p>
        <RulesForm initial={settings.rules} />
      </Section>

      <Section id="ritual" n={3} label="Daily ritual" lead={<>The checklist, <em>your</em> way.</>}>
        <RitualEditor initial={settings.ritual} />
      </Section>

      <Section id="tags" n={4} label="Tags" lead={<>The words you <em>tag</em> trades with.</>}>
        <VocabEditor initial={settings.vocab} />
      </Section>

      <Section id="appearance" n={5} label="Appearance">
        <Appearance initial={prefs} />
      </Section>

      <Section id="security" n={6} label="Security" lead={<>No one gets in but <em>you</em>.</>}>
        <Security passkeys={passkeys} sessions={sessions} passkeyOnly={settings.security.passkeyOnly} />
      </Section>

      <Section id="ai" n={7} label="AI coach">
        <AiToggle enabled={settings.ai.enabled} configured={aiConfigured()} model={env.aiModel} />
      </Section>

      <Section id="profile" n={8} label="Profile">
        <ProfileForm initial={settings.profile} />
      </Section>

      <Section id="data" n={9} label="Your data">
        <DataControls sampleCount={counts.sample} />
      </Section>
    </>
  );
}
