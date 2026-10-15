import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowUpRight } from "lucide-react";
import { getSettings } from "@/lib/data/settings";
import { activeDayCount, listTrades, tradeCounts } from "@/lib/data/trades";
import { dueCapsules, getJournalDay, listJournalDays } from "@/lib/data/journal";
import { listConnections } from "@/lib/data/connections";
import { briefingStubs } from "@/lib/data/briefing";
import { addDays, dayKey, isWeekend, longDate, minuteOfDay, startOfMonth, startOfWeek, todayKey, weekdayIndex } from "@/lib/analytics/time";
import { bySetup, dailySeries, inRange, summarize } from "@/lib/analytics/stats";
import { evaluateRules } from "@/lib/analytics/rules";
import { ringStreak, ringsClosed, ringsForDay } from "@/lib/analytics/rings";
import { propStatus } from "@/lib/analytics/prop";
import { detectTilt } from "@/lib/analytics/tilt";
import { buildDossier, observerName } from "@/lib/analytics/observer";
import { fmtMoney, fmtPct } from "@/lib/format";
import { parseUiPrefs, UI_COOKIE } from "@/lib/ui-prefs";
import { Card, CardHeader } from "@/components/ui/Card";
import { TodayHero } from "@/components/today/Hero";
import { Bento, type ThreadDay } from "@/components/today/Bento";
import { OpeningSequence, INTRO_COOKIE } from "@/components/today/OpeningSequence";
import { TraderRingsCard } from "@/components/today/TraderRings";
import { Ritual } from "@/components/today/Ritual";
import { Readiness } from "@/components/today/Readiness";
import { CapsuleCard } from "@/components/today/Capsule";
import { SyncPill } from "@/components/today/SyncPill";
import { Onboarding } from "@/components/today/Onboarding";
import { Welcome } from "@/components/today/Welcome";
import { passkeyCount } from "@/lib/auth/passkeys";

export const metadata = { title: "Today" };

function greeting(minute: number) {
  if (minute < 5 * 60) return "Still up";
  if (minute < 12 * 60) return "Good morning";
  if (minute < 17 * 60) return "Good afternoon";
  return "Good evening";
}

function SectionLabel({ n, title, aside }: { n: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-10 sm:mb-14">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="label">{n} — {title}</div>
        {aside}
      </div>
    </div>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const prefs = parseUiPrefs(jar.get(UI_COOKIE)?.value);
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const from = addDays(today, -89);
  const [journal, trades, stubs, conns, capsules, counts, journals, dayNumber] = await Promise.all([
    getJournalDay(today),
    listTrades({ since: new Date(`${addDays(from, -1)}T00:00:00Z`) }),
    briefingStubs(),
    listConnections(),
    dueCapsules(today),
    tradeCounts(),
    listJournalDays(from, today),
    activeDayCount(tz),
  ]);

  const firstName = settings.profile.name.trim().split(/\s+/)[0] || settings.profile.name;
  const nowMinute = minuteOfDay(new Date().toISOString(), tz);
  const hello = greeting(nowMinute);

  // Equity curve for the hero: cumulative net by day across the last 90 days.
  const series = dailySeries(trades.filter((t) => dayKey(t.exitTime, tz) >= from), tz);
  const curve = [0, ...series.map((d) => d.cum)];

  const todays = trades.filter((t) => dayKey(t.exitTime, tz) === today);
  const s = summarize(todays);
  const daily = new Map(series.map((d) => [d.day, d]));
  const weekNet = series.filter((d) => d.day >= startOfWeek(today)).reduce((x, d) => x + d.net, 0);
  const monthNet = series.filter((d) => d.day >= startOfMonth(today)).reduce((x, d) => x + d.net, 0);

  // Process: rings, streak and the thread of recent sessions.
  const rules = evaluateRules(trades, settings.rules, tz);
  const jMap = new Map(journals.map((j) => [j.day, j]));
  const entriesByDay = new Map<string, number>();
  for (const t of trades) {
    const d = dayKey(t.entryTime, tz);
    entriesByDay.set(d, (entriesByDay.get(d) ?? 0) + 1);
  }
  const ringsOn = (d: string) => ringsForDay(d, jMap.get(d), settings.ritual, entriesByDay.get(d) ?? 0, rules.byDay.get(d)?.violating ?? 0);
  const rings = ringsOn(today);
  const streak = ringStreak(today, jMap, settings.ritual, trades, rules, tz);
  const thread: ThreadDay[] = [];
  for (let d = today; thread.length < 21 && d >= from; d = addDays(d, -1)) {
    if (isWeekend(d)) continue;
    thread.unshift({ day: d, closed: ringsClosed(ringsOn(d)), traded: (entriesByDay.get(d) ?? 0) > 0 });
  }

  // The last 30 days, for the bento.
  const last30 = inRange(trades, tz, addDays(today, -29), today);
  const prev30 = inRange(trades, tz, addDays(today, -59), addDays(today, -30));
  const s30 = summarize(last30, settings.rules.defaultRisk);
  const p30 = summarize(prev30);
  const r30 = evaluateRules(last30, settings.rules, tz);
  const days30 = [...r30.byDay.values()];
  const best = bySetup(last30).filter((b) => b.trades >= 3).sort((a, b) => b.expectancy - a.expectancy)[0];

  // Readiness ↔ results, from your own history.
  const ready = journals.filter((j) => j.readiness && daily.has(j.day));
  const avgOf = (xs: typeof ready) => xs.reduce((x, j) => x + daily.get(j.day)!.net, 0) / Math.max(xs.length, 1);
  const score = (j: (typeof ready)[number]) => (j.readiness!.sleep + j.readiness!.energy + j.readiness!.focus + j.readiness!.mood) / 4;
  const hi = ready.filter((j) => score(j) >= 3.75);
  const lo = ready.filter((j) => score(j) <= 2.75);
  const readinessInsight =
    hi.length >= 3 && lo.length >= 2
      ? `Rested days average ${fmtMoney(avgOf(hi), { sign: true })}; tired days ${fmtMoney(avgOf(lo), { sign: true })}.`
      : "Log it daily — in a few weeks you'll see what your state is worth.";

  const lastSync = conns.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;
  const connError = conns.find((c) => c.lastError)?.lastError ?? null;
  const capsule = capsules.find((c) => !c.openedAt && c.deliverOn >= addDays(today, -21)) ?? null;
  const prop = settings.prop.enabled ? propStatus(trades, settings.prop, tz) : null;

  // The Observer's one-line read on the last 30 days.
  const observer = last30.length
    ? buildDossier({
        name: observerName(settings.profile.name, settings.observer.name),
        trades: last30,
        journals: journals.filter((j) => j.day >= addDays(today, -29)),
        rules: r30,
        tilt: detectTilt(last30, tz),
        settings,
        tz,
        from: addDays(today, -29),
        to: today,
      })
    : null;

  // A red day gets one lesson and one next step — never a punishment screen.
  const todayBreaks = rules.violations.filter((v) => v.day === today);
  const redDay = s.trades > 0 && s.net < 0;

  const sunday = weekdayIndex(today) === 6;
  const weekly = stubs.find((x) => x.period === "weekly");
  const playIntro = prefs.intro && jar.get(INTRO_COOKIE)?.value !== today && sp.welcome !== "1";

  return (
    <div className="space-y-[clamp(6rem,14vh,11rem)]">
      {playIntro && <OpeningSequence day={today} greeting={hello} dayNumber={dayNumber} values={curve} />}
      {sp.welcome === "1" && <Welcome hasPasskey={(await passkeyCount()) > 0} />}
      {counts.total === 0 && conns.length === 0 && <Onboarding />}

      <TodayHero
        dateLabel={longDate(today)}
        dayNumber={dayNumber}
        greeting={hello}
        name={firstName}
        curve={curve}
        todayNet={s.net}
        todayTrades={s.trades}
        todayWinRate={s.winRate}
        weekNet={weekNet}
        monthNet={monthNet}
        stubs={stubs}
        sync={<SyncPill lastSyncAt={lastSync} hasConnections={conns.length > 0} error={connError} />}
      />

      {redDay && (
        <section className="glass grid gap-6 rounded-[3px] p-6 sm:grid-cols-[auto_1fr_1fr] sm:items-start sm:p-8">
          <div className="eyebrow pt-1">A red day</div>
          <div>
            <div className="eyebrow mb-2 !text-ink-4">One lesson</div>
            <p className="text-[15.5px] leading-relaxed">
              {todayBreaks.length
                ? `${todayBreaks[0]!.detail}. That rule exists for exactly this moment.`
                : "Every trade stayed inside your rules. A red day inside the plan is simply the cost of doing business."}
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2 !text-ink-4">One next step</div>
            <p className="text-[15.5px] leading-relaxed">
              {observer?.tell[0] ? `When ${observer.tell[0].when}, ${observer.tell[0].then}` : "Write two lines in tonight's review, then close the laptop. Tomorrow is a new tape."}
            </p>
          </div>
        </section>
      )}

      <section>
        <div id="thirty" /><SectionLabel n="01" title="The last thirty days" aside={<Link href="/insights" className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors hover:text-ink">All insights →</Link>} />
        <Bento
          s={{
            trades: s30.trades,
            winRate: s30.winRate,
            winRatePrev: p30.trades >= 5 ? p30.winRate : null,
            profitFactor: s30.profitFactor,
            expectancy: s30.expectancy,
            avgR: s30.avgR,
            bestSetup: best ? { name: best.label, expectancy: best.expectancy, trades: best.trades } : null,
            streak,
            thread,
            cleanDays: days30.filter((d) => d.violating === 0).length,
            tradingDays: days30.length,
          }}
        />
      </section>

      <section>
        <SectionLabel n="02" title="Today's session" />
        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader eyebrow="Daily ritual" title="Tick it off" />
            <Ritual day={today} items={settings.ritual} checklist={journal.checklist} tasks={journal.tasks} />
          </Card>
          <div className="space-y-5 lg:col-span-5">
            <Card>
              <CardHeader eyebrow="Process" title="Close all three" />
              <TraderRingsCard prepare={rings.prepare} discipline={rings.discipline} reflect={rings.reflect} streak={streak} />
            </Card>
            <Card>
              <CardHeader eyebrow="Readiness" title="Mind before market" />
              <Readiness day={today} initial={journal.readiness} initialIntention={journal.intention} insight={readinessInsight} />
            </Card>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel n="03" title="Perspective" />
        <div className="grid gap-5 lg:grid-cols-3">
          {observer && (
            <Link href="/observer" className="glass lift group flex min-h-[220px] flex-col rounded-[3px] p-6 sm:p-7">
              <div className="eyebrow">From the outside</div>
              <p className="display mt-5 text-[22px] leading-[1.2] !tracking-[-0.025em]">{observer.headline}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-6 text-[13.5px] font-medium text-ink-2 transition-colors group-hover:text-ink">
                Step outside <ArrowUpRight size={15} />
              </span>
            </Link>
          )}
          <Link href="/briefing/weekly" className="glass lift group flex min-h-[220px] flex-col rounded-[3px] p-6 sm:p-7">
            <div className="eyebrow">{sunday ? "Unlocked today" : "Weekly replay"}</div>
            <p className="display mt-5 text-[22px] leading-[1.2] !tracking-[-0.025em]">
              {sunday ? "Your week, replayed. Ten slides, two minutes." : `Your week so far: ${fmtMoney(weekly?.net ?? weekNet, { sign: true })}.`}
            </p>
            <span className="mt-auto inline-flex items-center gap-1 pt-6 text-[13.5px] font-medium text-ink-2 transition-colors group-hover:text-ink">
              {sunday ? "Play the replay" : "Full replay unlocks Sunday · preview now"} <ArrowUpRight size={15} />
            </span>
          </Link>
          {prop ? (
            <Link href="/guardian" className="glass lift group flex min-h-[220px] flex-col rounded-[3px] p-6 sm:p-7">
              <div className="eyebrow">{settings.prop.firm} Guardian</div>
              <p className="display mt-5 text-[22px] leading-[1.2] !tracking-[-0.025em]">
                {prop.breached ? "Max loss breached." : `${fmtMoney(prop.cushion)} above the max-loss line.`}
              </p>
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-fill-3">
                <div className="h-full rounded-full bg-pos" style={{ width: `${Math.round(Math.max(0, Math.min(1, prop.targetProgress ?? 0)) * 100)}%` }} />
              </div>
              <span className="mt-auto inline-flex items-center gap-1 pt-6 text-[13.5px] font-medium text-ink-2 transition-colors group-hover:text-ink">
                {prop.targetProgress !== null ? `${fmtPct(prop.targetProgress)} to target` : "Open Guardian"} <ArrowUpRight size={15} />
              </span>
            </Link>
          ) : capsule ? (
            <CapsuleCard capsule={capsule} />
          ) : (
            <Link href={`/journal/${today}`} className="glass lift group flex min-h-[220px] flex-col rounded-[3px] p-6 sm:p-7">
              <div className="eyebrow">Tonight</div>
              <p className="display mt-5 text-[22px] leading-[1.2] !tracking-[-0.025em]">Two lines on today. Future you will read them.</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-6 text-[13.5px] font-medium text-ink-2 transition-colors group-hover:text-ink">
                Open today&apos;s journal <ArrowUpRight size={15} />
              </span>
            </Link>
          )}
        </div>
        {prop && capsule && (
          <div className="mt-5">
            <CapsuleCard capsule={capsule} />
          </div>
        )}
      </section>
    </div>
  );
}
