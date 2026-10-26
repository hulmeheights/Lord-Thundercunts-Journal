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
import { Notifications } from "@/components/settings/Notifications";
import { fmtMinute, todayKey, windowFor } from "@/lib/analytics/time";
import { recentPushes } from "@/lib/push";
import { Widget } from "@/components/settings/Widget";
import { Inactivity } from "@/components/settings/Inactivity";
import { foundAccounts } from "@/lib/data/inactivity";
import { widgetFeed, widgetStatus } from "@/lib/data/widget";
import { listLedger } from "@/lib/data/ledger";
import { summarizeLedger } from "@/lib/analytics/ledger";
import { Dot, PageHead, Section } from "@/components/m";
import { SectionIndex } from "@/components/m/SectionIndex";

export const metadata = { title: "Settings" };

const SECTIONS = ["connections", "rules", "ritual", "tags", "appearance", "notifications", "widget", "security", "ai", "profile", "data"];

/** Dates are formatted here, once, so the server and the phone never disagree on the text. */
const stamp = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function noticeFrom(sp: Record<string, string | string[] | undefined>): ConnectNotice {
  const k = sp.tradovate;
  if (k !== "connected" && k !== "cancelled" && k !== "expired" && k !== "error") return null;
  const n = Number(sp.n);
  const msg = typeof sp.msg === "string" ? sp.msg.slice(0, 240) : undefined;
  return { kind: k, n: Number.isFinite(n) ? n : undefined, msg };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const [settings, connections, accounts, passkeys, sessions, counts, sp, jar, pushes, widget, feed, ledger, watched] = await Promise.all([
    getSettings(),
    listConnections(),
    listBrokerAccounts(),
    listPasskeys(),
    listSessions(session.id),
    tradeCounts(),
    searchParams,
    cookies(),
    recentPushes(),
    widgetStatus(),
    widgetFeed(),
    listLedger(),
    foundAccounts(),
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
        aside={<span className="eyebrow">{nightly ? "Hourly sync · on" : "Syncs when you open it"}</span>}
      >
        <Connections connections={connections} accounts={accounts} notice={noticeFrom(sp)} />
        {!nightly && (
          <p className="mt-8 max-w-[60ch] font-mono text-[10.5px] leading-[1.8] text-ink-4">
            Add CRON_SECRET in Vercel to switch on the hourly sync and the phone reminders. Until then it syncs whenever you open the journal.
          </p>
        )}
      </Section>

      <Section id="rules" n={2} label="Trading rules" lead={<>The rules you <em>said</em> you&apos;d keep.</>}>
        <p className="reveal -mt-8 mb-12 max-w-[56ch] font-mono text-[11.5px] leading-[1.9] text-ink-3">
          Checked automatically against every synced trade. Guardian, the report card, the Observer and the Rule Lab all read them.
        </p>
        <RulesForm
          initial={settings.rules}
          windowNote={(() => {
            const w = windowFor({ ...settings.rules, followMarket: true }, todayKey(settings.profile.timezone), settings.profile.timezone);
            return w.shift && w.start !== null && w.end !== null ? `This week it's ${fmtMinute(w.start)}–${fmtMinute(w.end)} on your clock.` : null;
          })()}
        />
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

      <Section id="notifications" n={6} label="Notifications" lead={<>A tap on the <em>shoulder</em>.</>}>
        <Notifications
          initial={settings.notify}
          scheduled={nightly}
          timezone={settings.profile.timezone}
          recent={pushes.map((r) => ({ kind: r.kind, at: stamp(r.sentAt, settings.profile.timezone) }))}
        />
        <div className="mt-14">
          <Inactivity initial={settings.inactivity} accounts={watched} today={todayKey(settings.profile.timezone)} />
        </div>
      </Section>

      <Section id="widget" n={7} label="Widget" lead={<>On your <em>Lock Screen</em>, all day.</>}>
        <Widget
          active={widget.active}
          lastUsed={widget.lastUsedAt ? stamp(widget.lastUsedAt, settings.profile.timezone) : null}
          initial={settings.widget}
          preview={(() => {
            const l = summarizeLedger(ledger);
            return { line: { kind: feed.kind, words: feed.words, by: feed.by }, status: feed.status, date: feed.date, window: feed.window, streak: feed.streak, mission: feed.mission, funded: l.liveFunded, payouts: l.payouts, paidOut: Math.round(l.paidOut) };
          })()}
        />
      </Section>

      <Section id="security" n={8} label="Security" lead={<>No one gets in but <em>you</em>.</>}>
        <Security passkeys={passkeys} sessions={sessions} passkeyOnly={settings.security.passkeyOnly} />
      </Section>

      <Section id="ai" n={9} label="AI coach">
        <AiToggle enabled={settings.ai.enabled} configured={aiConfigured()} model={`${env.aiModelDeep} · ${env.aiModelLight}`} />
      </Section>

      <Section id="profile" n={10} label="Profile">
        <ProfileForm initial={settings.profile} />
      </Section>

      <Section id="data" n={11} label="Your data">
        <DataControls sampleCount={counts.sample} />
      </Section>
    </>
  );
}
