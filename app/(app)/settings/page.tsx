import { Lock } from "lucide-react";
import { requireSession, listSessions } from "@/lib/auth/session";
import { listPasskeys } from "@/lib/auth/passkeys";
import { aiConfigured, env } from "@/lib/env";
import { getSettings } from "@/lib/data/settings";
import { listBrokerAccounts, listConnections } from "@/lib/data/connections";
import { tradeCounts } from "@/lib/data/trades";
import { lockNow } from "@/lib/actions/auth";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Connections } from "@/components/settings/Connections";
import { AiToggle, ProfileForm, RitualEditor, RulesForm, VocabEditor } from "@/components/settings/Forms";
import { Security } from "@/components/settings/Security";
import { DataControls } from "@/components/settings/DataControls";

export const metadata = { title: "Settings" };

const SECTIONS = [
  ["connections", "Connections"],
  ["rules", "Trading rules"],
  ["ritual", "Daily ritual"],
  ["tags", "Tags"],
  ["security", "Security"],
  ["ai", "AI coach"],
  ["profile", "Profile"],
  ["data", "Data"],
] as const;

export default async function SettingsPage() {
  const session = await requireSession();
  const [settings, connections, accounts, passkeys, sessions, counts] = await Promise.all([
    getSettings(),
    listConnections(),
    listBrokerAccounts(),
    listPasskeys(),
    listSessions(session.id),
    tradeCounts(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Make it yours" title="Settings">
        <form action={lockNow}>
          <Button variant="secondary" type="submit">
            <Lock size={15} /> Lock now
          </Button>
        </form>
      </PageHeader>
      <nav className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-line bg-fill px-3.5 py-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
      <div className="space-y-5">
        <Card>
          <div id="connections" className="scroll-mt-24" />
          <CardHeader eyebrow="Auto-import" title="Broker connections" />
          <Connections connections={connections} accounts={accounts} />
          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-4">
            {env.cronSecret.length >= 16
              ? "Nightly auto-sync is on (weekdays after the close). The app also syncs whenever you open it."
              : "Tip: add CRON_SECRET in Vercel to enable nightly auto-sync. The app already syncs whenever you open it."}
          </p>
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <div id="rules" className="scroll-mt-24" />
            <CardHeader eyebrow="Auto-enforced" title="Trading rules" />
            <RulesForm initial={settings.rules} />
          </Card>
          <div className="space-y-5">
            <Card>
              <div id="ritual" className="scroll-mt-24" />
              <CardHeader eyebrow="Your checklist" title="Daily ritual" />
              <RitualEditor initial={settings.ritual} />
            </Card>
            <Card>
              <div id="tags" className="scroll-mt-24" />
              <CardHeader eyebrow="Tagging vocabulary" title="Setups, mistakes & emotions" />
              <VocabEditor initial={settings.vocab} />
            </Card>
          </div>
        </div>
        <Card>
          <div id="security" className="scroll-mt-24" />
          <CardHeader eyebrow="Private by default" title="Security" />
          <Security passkeys={passkeys} sessions={sessions} passkeyOnly={settings.security.passkeyOnly} />
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <div id="ai" className="scroll-mt-24" />
            <CardHeader eyebrow="Thunder" title="AI coach" />
            <AiToggle enabled={settings.ai.enabled} configured={aiConfigured()} model={env.aiModel} />
          </Card>
          <Card>
            <div id="profile" className="scroll-mt-24" />
            <CardHeader eyebrow="You" title="Profile" />
            <ProfileForm initial={settings.profile} />
          </Card>
        </div>
        <Card>
          <div id="data" className="scroll-mt-24" />
          <CardHeader eyebrow="Your data" title="Data & privacy" />
          <DataControls sampleCount={counts.sample} />
        </Card>
      </div>
    </>
  );
}
