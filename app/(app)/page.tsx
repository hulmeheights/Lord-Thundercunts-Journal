import Link from "next/link";
import { ArrowUpRight, BookOpen, Eye, MessageCircle, ShieldCheck } from "lucide-react";
import { getSettings } from "@/lib/data/settings";
import { listTrades, tradeCounts } from "@/lib/data/trades";
import { dueCapsules, getJournalDay, listJournalDays } from "@/lib/data/journal";
import { listConnections } from "@/lib/data/connections";
import { briefingStubs } from "@/lib/data/briefing";
import { addDays, dayKey, longDate, minuteOfDay, startOfMonth, startOfWeek, todayKey, WEEKDAYS } from "@/lib/analytics/time";
import { dailySeries, equityCurve, summarize } from "@/lib/analytics/stats";
import { evaluateRules } from "@/lib/analytics/rules";
import { ringStreak, ringsForDay } from "@/lib/analytics/rings";
import { propStatus } from "@/lib/analytics/prop";
import { detectTilt } from "@/lib/analytics/tilt";
import { buildDossier, observerName } from "@/lib/analytics/observer";
import { fmtMoney, fmtPct, plural } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/Card";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { Sparkline } from "@/components/charts/Sparkline";
import { StoryRings } from "@/components/today/StoryRings";
import { TraderRingsCard } from "@/components/today/TraderRings";
import { Ritual } from "@/components/today/Ritual";
import { Readiness } from "@/components/today/Readiness";
import { CapsuleCard } from "@/components/today/Capsule";
import { SyncPill } from "@/components/today/SyncPill";
import { Onboarding } from "@/components/today/Onboarding";
import { Gauge } from "@/components/charts/Gauge";
import { Welcome } from "@/components/today/Welcome";
import { passkeyCount } from "@/lib/auth/passkeys";

export const metadata = { title: "Today" };

function greeting(minute: number) {
  if (minute < 5 * 60) return "Burning the midnight oil";
  if (minute < 12 * 60) return "Good morning";
  if (minute < 17 * 60) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const from = addDays(today, -75);
  const [journal, trades, stubs, conns, capsules, counts, journals] = await Promise.all([
    getJournalDay(today),
    listTrades({ since: new Date(`${from}T00:00:00Z`) }),
    briefingStubs(),
    listConnections(),
    dueCapsules(today),
    tradeCounts(),
    listJournalDays(from, today),
  ]);

  const todays = trades.filter((t) => dayKey(t.exitTime, tz) === today);
  const s = summarize(todays);
  const curve = [0, ...equityCurve(todays).map((p) => p.cum)];
  const rules = evaluateRules(trades, settings.rules, tz);
  const jMap = new Map(journals.map((j) => [j.day, j]));
  const enteredToday = trades.filter((t) => dayKey(t.entryTime, tz) === today).length;
  const rings = ringsForDay(today, journal, settings.ritual, enteredToday, rules.byDay.get(today)?.violating ?? 0);
  const streak = ringStreak(today, jMap, settings.ritual, trades, rules, tz);

  const daily = new Map(dailySeries(trades, tz).map((d) => [d.day, d]));
  const weekStart = startOfWeek(today);
  const week = Array.from({ length: 5 }, (_, i) => {
    const d = addDays(weekStart, i);
    return { day: d, net: daily.get(d)?.net ?? null, future: d > today };
  });
  const weekNet = [...daily.values()].filter((d) => d.day >= weekStart).reduce((x, d) => x + d.net, 0);
  const monthNet = [...daily.values()].filter((d) => d.day >= startOfMonth(today)).reduce((x, d) => x + d.net, 0);

  // Readiness ↔ results, from your own history.
  const ready = journals.filter((j) => j.readiness && daily.has(j.day));
  const avgOf = (xs: typeof ready) => xs.reduce((x, j) => x + daily.get(j.day)!.net, 0) / Math.max(xs.length, 1);
  const score = (j: (typeof ready)[number]) => (j.readiness!.sleep + j.readiness!.energy + j.readiness!.focus + j.readiness!.mood) / 4;
  const hi = ready.filter((j) => score(j) >= 3.75);
  const lo = ready.filter((j) => score(j) <= 2.75);
  const readinessInsight =
    hi.length >= 3 && lo.length >= 2
      ? `When you score high you average ${fmtMoney(avgOf(hi), { sign: true })}/day; when low, ${fmtMoney(avgOf(lo), { sign: true })}.`
      : "Log it daily — after a few weeks you'll see exactly how your state moves your P&L.";

  const lastSync = conns.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;
  const connError = conns.find((c) => c.lastError)?.lastError ?? null;
  const capsule = capsules.find((c) => !c.openedAt && c.deliverOn >= addDays(today, -21)) ?? null;
  const prop = settings.prop.enabled ? propStatus(trades, settings.prop, tz) : null;
  const nowMinute = minuteOfDay(new Date().toISOString(), tz);

  // The Observer's one-line read on the last 30 days.
  const obsFrom = addDays(today, -29);
  const obsTrades = trades.filter((t) => {
    const d = dayKey(t.exitTime, tz);
    return d >= obsFrom && d <= today;
  });
  const observer = obsTrades.length
    ? buildDossier({
        name: observerName(settings.profile.name, settings.observer.name),
        trades: obsTrades,
        journals: journals.filter((j) => j.day >= obsFrom),
        rules: evaluateRules(obsTrades, settings.rules, tz),
        tilt: detectTilt(obsTrades, tz),
        settings,
        tz,
        from: obsFrom,
        to: today,
      })
    : null;

  return (
    <div className="space-y-6 sm:space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">{longDate(today)}</div>
          <h1 className="title-xl">
            {greeting(nowMinute)},<br className="sm:hidden" /> <span className="text-brand">{settings.profile.name}</span>.
          </h1>
        </div>
        <SyncPill lastSyncAt={lastSync} hasConnections={conns.length > 0} error={connError} />
      </header>

      {sp.welcome === "1" && <Welcome hasPasskey={(await passkeyCount()) > 0} />}
      {counts.total === 0 && conns.length === 0 && <Onboarding />}

      <section>
        <div className="eyebrow mb-3">Your briefings</div>
        <StoryRings stubs={stubs} />
      </section>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="eyebrow mb-1.5">Today&apos;s P&amp;L</div>
              <div className={cn("text-[46px] leading-none font-bold tracking-[-0.04em] sm:text-[56px]", s.net > 0 ? "text-pos" : s.net < 0 ? "text-neg" : "text-ink")}>
                <NumberTicker value={s.net} />
              </div>
              <div className="mt-2.5 text-[13.5px] text-ink-2">
                {s.trades ? (
                  <>
                    {plural(s.trades, "trade")} · {fmtPct(s.winRate)} win rate
                    {s.largestWin > 0 && <> · best {fmtMoney(s.largestWin, { sign: true })}</>}
                  </>
                ) : (
                  "Flat. Patience is a position."
                )}
              </div>
            </div>
            <div className="hidden pt-2 sm:block">
              <Sparkline values={curve} width={150} height={56} />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-5 gap-2">
            {week.map((d, i) => (
              <Link
                key={d.day}
                href={`/journal/${d.day}`}
                className={cn(
                  "rounded-2xl border px-2 py-2.5 text-center transition-colors hover:bg-fill-2",
                  d.day === today ? "border-cyan/50 bg-cyan/5" : "border-line bg-fill",
                  d.future && "opacity-40",
                )}
              >
                <div className="text-[11px] font-semibold text-ink-3">{WEEKDAYS[i]}</div>
                <div className={cn("num mt-1 text-[12px] font-semibold whitespace-nowrap sm:text-[12.5px]", d.net === null ? "text-ink-4" : d.net >= 0 ? "text-pos" : "text-neg")}>
                  {d.net === null ? "—" : fmtMoney(d.net, { sign: true, compact: true, compactFrom: 1000 })}
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex gap-6 border-t border-line pt-4 text-[13px]">
            <div>
              <span className="text-ink-3">This week </span>
              <span className={cn("num font-semibold", weekNet >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(weekNet, { sign: true })}</span>
            </div>
            <div>
              <span className="text-ink-3">This month </span>
              <span className={cn("num font-semibold", monthNet >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(monthNet, { sign: true })}</span>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader eyebrow="Trader Rings" title="Close all three" />
          <TraderRingsCard prepare={rings.prepare} discipline={rings.discipline} reflect={rings.reflect} streak={streak} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader eyebrow="Daily ritual" title="Tick it off" />
          <Ritual day={today} items={settings.ritual} checklist={journal.checklist} tasks={journal.tasks} />
        </Card>

        <div className="space-y-5 lg:col-span-5">
          {capsule && <CapsuleCard capsule={capsule} />}
          <Card>
            <CardHeader eyebrow="Readiness check-in" title="Mind before market" />
            <Readiness day={today} initial={journal.readiness} initialIntention={journal.intention} insight={readinessInsight} />
          </Card>

          {prop && (
            <Link href="/guardian" className="block">
              <Card className="transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-4">
                  <Gauge value={prop.cushionPct} size={110} stroke={10}>
                    <div className="text-center">
                      <div className="num text-[15px] font-bold">{fmtMoney(prop.cushion, { compact: true })}</div>
                      <div className="text-[10px] text-ink-3">cushion</div>
                    </div>
                  </Gauge>
                  <div className="min-w-0">
                    <div className="eyebrow mb-1 flex items-center gap-1.5">
                      <ShieldCheck size={13} /> {settings.prop.firm} Guardian
                    </div>
                    <div className="text-[15px] font-semibold">
                      {prop.breached ? "Max loss breached" : `${fmtMoney(prop.cushion)} above your max loss`}
                    </div>
                    {prop.targetProgress !== null && (
                      <div className="mt-1 text-[13px] text-ink-3">{fmtPct(prop.targetProgress)} of the way to target</div>
                    )}
                  </div>
                  <ArrowUpRight size={18} className="ml-auto shrink-0 text-ink-3" />
                </div>
              </Card>
            </Link>
          )}

          {observer && (
            <Link href="/observer" className="block">
              <Card className="transition-transform hover:scale-[1.01]">
                <div className="eyebrow mb-2 flex items-center gap-1.5">
                  <Eye size={13} className="text-cyan" /> From the outside
                </div>
                <p className="text-[15.5px] leading-snug font-semibold">{observer.headline}</p>
                {observer.tell[0] && (
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
                    Tell {observer.name}: when {observer.tell[0].when}, {observer.tell[0].then}
                  </p>
                )}
                <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-cyan">
                  Step outside <ArrowUpRight size={14} />
                </div>
              </Card>
            </Link>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link href={`/journal/${today}`} className="glass flex flex-col gap-3 rounded-[24px] p-4 transition-transform hover:scale-[1.02]">
              <BookOpen size={20} className="text-cyan" />
              <div>
                <div className="text-[14px] font-semibold">Journal today</div>
                <div className="text-[12px] text-ink-3">Plan &amp; review</div>
              </div>
            </Link>
            <Link href="/coach" className="glass flex flex-col gap-3 rounded-[24px] p-4 transition-transform hover:scale-[1.02]">
              <MessageCircle size={20} className="text-purple" />
              <div>
                <div className="text-[14px] font-semibold">Ask Thunder</div>
                <div className="text-[12px] text-ink-3">Your AI coach</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
