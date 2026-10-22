import Link from "next/link";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/data/settings";
import { activeDayCount, listTrades, tradeCounts } from "@/lib/data/trades";
import { dueCapsules, getJournalDay, listJournalDays } from "@/lib/data/journal";
import { listConnections } from "@/lib/data/connections";
import { briefingStubs } from "@/lib/data/briefing";
import { db } from "@/lib/db";
import { addDays, dayKey, isWeekend, longDate, minuteOfDay, startOfMonth, startOfWeek, timeInTz, todayKey, weekdayIndex } from "@/lib/analytics/time";
import { bySetup, dailySeries, inRange, summarize } from "@/lib/analytics/stats";
import { evaluateRules } from "@/lib/analytics/rules";
import { ringStreak, ringsClosed, ringsForDay } from "@/lib/analytics/rings";
import { propStatus } from "@/lib/analytics/prop";
import { detectTilt } from "@/lib/analytics/tilt";
import { buildDossier, observerName } from "@/lib/analytics/observer";
import { fmtMoney, fmtPct } from "@/lib/format";
import { parseUiPrefs, UI_COOKIE } from "@/lib/ui-prefs";
import { Row, Rows } from "@/components/m";
import { Manifesto } from "@/components/m/Manifesto";
import { LimitLine } from "@/components/m/LimitLine";
import { SectionIndex } from "@/components/m/SectionIndex";
import { TodayHero } from "@/components/today/Hero";
import { Thirty } from "@/components/today/Thirty";
import type { ThreadDay } from "@/components/today/Vine";
import { Chapter } from "@/components/today/Layout";
import { OpeningSequence, INTRO_COOKIE } from "@/components/today/OpeningSequence";
import { Ritual } from "@/components/today/Ritual";
import { Readiness } from "@/components/today/Readiness";
import { Process } from "@/components/today/Process";
import { CapsuleCard } from "@/components/today/Capsule";
import { evaluateCapsule } from "@/lib/analytics/capsule";
import { listLedger } from "@/lib/data/ledger";
import { SyncPill } from "@/components/today/SyncPill";
import { Onboarding } from "@/components/today/Onboarding";
import { Welcome } from "@/components/today/Welcome";
import { Milestone, type Moment } from "@/components/today/Milestone";
import { emphasise, numberWord } from "@/components/today/words";
import { passkeyCount } from "@/lib/auth/passkeys";

export const metadata = { title: "Today" };

function greeting(minute: number) {
  if (minute < 5 * 60) return "Still up";
  if (minute < 12 * 60) return "Good morning";
  if (minute < 17 * 60) return "Good afternoon";
  return "Good evening";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TRADE_MARKS = [100, 250, 500, 1000, 2500];
const TRADE_SUBS: Record<number, string> = {
  100: "Most traders stop writing it down after a week. You kept the record a hundred times.",
  250: "Enough trades for the numbers to start telling the truth about you.",
  500: "Five hundred honest entries. The edge lives in the record now.",
  1000: "A thousand trades on the record. Patterns have nowhere left to hide.",
  2500: "Two and a half thousand trades. This is no longer a journal — it's a body of work.",
};

function tradeMoment(mark: number, crossed: number[], preview = false): Moment {
  return {
    id: `trades-${mark}`,
    also: crossed.map((c) => `trades-${c}`),
    line: `${cap(numberWord(mark))} trades. *Logged.*`,
    value: mark,
    format: "number",
    caption: "Trades on the record",
    sub: TRADE_SUBS[mark] ?? "Every one of them written down.",
    preview,
  };
}

/** When the review was written: the journal row's last update, in the owner's timezone. */
async function reviewTime(day: string, tz: string): Promise<string | null> {
  try {
    const sql = await db();
    const [r] = await sql<{ t: Date | string }[]>`select updated_at as t from journal_days where day = ${day}`;
    return r?.t ? timeInTz(new Date(r.t).toISOString(), tz) : null;
  } catch {
    return null;
  }
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
  const hello = greeting(minuteOfDay(new Date().toISOString(), tz));

  // The living line: cumulative net by day across the last 90 days.
  const series = dailySeries(trades.filter((t) => dayKey(t.exitTime, tz) >= from), tz);
  const curve = [0, ...series.map((d) => d.cum)];

  const todays = trades.filter((t) => dayKey(t.exitTime, tz) === today);
  const s = summarize(todays);
  const daily = new Map(series.map((d) => [d.day, d]));
  const weekNet = series.filter((d) => d.day >= startOfWeek(today)).reduce((x, d) => x + d.net, 0);
  const monthNet = series.filter((d) => d.day >= startOfMonth(today)).reduce((x, d) => x + d.net, 0);

  // Process: rings, streak and the vine of recent sessions.
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

  // The last 30 days.
  const last30 = inRange(trades, tz, addDays(today, -29), today);
  const prev30 = inRange(trades, tz, addDays(today, -59), addDays(today, -30));
  const s30 = summarize(last30, settings.rules.defaultRisk);
  const p30 = summarize(prev30);
  const r30 = evaluateRules(last30, settings.rules, tz);
  const days30 = [...r30.byDay.values()];
  const best = bySetup(last30).filter((b) => b.trades >= 3).sort((a, b) => b.expectancy - a.expectancy)[0];
  const winDelta = p30.trades >= 5 ? Math.round((s30.winRate - p30.winRate) * 100) : 0;
  const thirtyLead =
    winDelta >= 3 ? (
      <>
        Sharper than the thirty days <em>before</em>.
      </>
    ) : winDelta <= -3 ? (
      <>
        A harder month. The process still <em>counts</em>.
      </>
    ) : (
      <>
        Thirty days, measured <em>honestly</em>.
      </>
    );

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
  // Its goals, measured over the whole time it was sealed (which can reach back past the 90 days loaded above).
  const capsuleGoals = capsule?.goals.length
    ? evaluateCapsule(
        capsule,
        capsule.createdAt.slice(0, 10) < from ? await listTrades({ since: new Date(addDays(capsule.createdAt.slice(0, 10), -1)) }) : trades,
        await listLedger(),
        tz,
        today,
      )
    : [];
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

  // Session closed: once tonight's review is written.
  const reviewed = (journal.review?.trim().length ?? 0) >= 15 || (journal.lessons?.trim().length ?? 0) >= 15;
  const closedAt = reviewed ? await reviewTime(today, tz) : null;

  // Retention moments — real trades only, never the sample set.
  const real = counts.total - counts.sample;
  const crossed = TRADE_MARKS.filter((m) => real >= m);
  const moments: Moment[] = [];
  if (crossed.length) moments.push(tradeMoment(crossed.at(-1)!, crossed));
  const todayStat = daily.get(today);
  const priorHigh = Math.max(0, ...series.filter((d) => d.day < today).map((d) => d.cum));
  const highMoment = (preview: boolean): Moment => ({
    id: `high-${today}`,
    line: "A new equity *high*.",
    // The peak of the ninety-day curve: today's close when the moment is earned.
    value: Math.max(...curve),
    format: "money",
    caption: "90-day high · closed today",
    sub: "The curve has not been here in ninety days. Bank the lesson, not just the money.",
    preview,
  });
  if (todayStat && todayStat.net > 0 && series.length >= 10 && todayStat.cum > priorHigh) moments.push(highMoment(false));
  const ask = typeof sp.moment === "string" ? sp.moment : null;
  if (ask === "high") moments.unshift(highMoment(true));
  else if (ask?.startsWith("trades-") && TRADE_MARKS.includes(Number(ask.slice(7)))) {
    const mark = Number(ask.slice(7));
    moments.unshift(tradeMoment(mark, TRADE_MARKS.filter((m) => m <= mark), true));
  }

  const sunday = weekdayIndex(today) === 6;
  const weekly = stubs.find((x) => x.period === "weekly");
  const playIntro = prefs.intro && jar.get(INTRO_COOKIE)?.value !== today && sp.welcome !== "1";

  let n = 0;
  const sections = ["top", "thirty", "session", ...(observer ? ["outside"] : []), "week"];

  return (
    // At xl the fixed section index sits in the right margin; keep the scroll clear of it.
    <div className="xl:pr-16 min-[1760px]:pr-0">
      {playIntro && <OpeningSequence day={today} greeting={hello} dayNumber={dayNumber} values={curve} />}
      <Milestone moments={moments} curve={curve} delay={playIntro ? 3300 : 900} />
      <SectionIndex ids={sections} />
      {sp.welcome === "1" && <Welcome hasPasskey={(await passkeyCount()) > 0} />}

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
        closedAt={closedAt}
        intro={playIntro}
        sync={<SyncPill lastSyncAt={lastSync} hasConnections={conns.length > 0} error={connError} />}
      />

      {counts.total === 0 && conns.length === 0 && (
        <div className="py-[clamp(2rem,6vh,4rem)]">
          <Onboarding />
        </div>
      )}

      {redDay && (
        <section aria-label="A red day" className="grid grid-cols-1 gap-x-[clamp(1.2rem,4vw,3.5rem)] border-b border-line md:grid-cols-2">
          <div className="reveal border-t border-line py-[clamp(1.8rem,4.5vh,2.6rem)]">
            <div className="label mb-4 !text-[9px] !tracking-[0.36em]">One lesson</div>
            <p className="max-w-[44ch] font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">
              {todayBreaks.length
                ? `${todayBreaks[0]!.detail}. That rule exists for exactly this moment.`
                : "Every trade stayed inside your rules. A red day inside the plan is simply the cost of doing business."}
            </p>
          </div>
          <div className="reveal border-t border-line py-[clamp(1.8rem,4.5vh,2.6rem)]" style={{ "--d": "80ms" } as React.CSSProperties}>
            <div className="label mb-4 !text-[9px] !tracking-[0.36em]">One next step</div>
            <p className="max-w-[44ch] font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2">
              {observer?.tell[0] ? `When ${observer.tell[0].when}, ${observer.tell[0].then}` : "Write two lines in tonight's review, then close the laptop. Tomorrow is a new tape."}
            </p>
          </div>
        </section>
      )}

      <Chapter
        n={++n}
        id="thirty"
        label="The last thirty days"
        lead={thirtyLead}
        aside={
          <Link href="/insights" className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink max-sm:hidden">
            All insights →
          </Link>
        }
      >
        <Thirty
          today={today}
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
      </Chapter>

      <Chapter
        n={++n}
        id="session"
        label="Today's session"
        lead={
          <>
            The process is the only thing you <em>control</em>.
          </>
        }
      >
        <div className="space-y-[clamp(4.5rem,11vh,7rem)]">
          <Ritual day={today} items={settings.ritual} checklist={journal.checklist} tasks={journal.tasks} layout="split" />
          <Readiness day={today} initial={journal.readiness} initialIntention={journal.intention} insight={readinessInsight} layout="split" />
          <Process prepare={rings.prepare} discipline={rings.discipline} reflect={rings.reflect} streak={streak} />
        </div>
      </Chapter>

      {observer && (
        <Chapter n={++n} id="outside" label="From the outside">
          <Manifesto text={emphasise(observer.headline)} />
          <div className="reveal mt-[clamp(2.6rem,7vh,4rem)] flex flex-wrap items-center gap-x-10 gap-y-4">
            <span className="font-mono text-[10px] tracking-[0.28em] text-ink-4 uppercase">— The Observer · last 30 days</span>
            <Link href="/observer" className="m-link pb-1 font-mono text-[10px] tracking-[0.3em] text-ink-2 uppercase">
              Step outside →
            </Link>
          </div>
        </Chapter>
      )}

      <Chapter n={++n} id="week" label="This week">
        <Rows>
          <Row
            i="01"
            href="/briefing/weekly"
            title={
              sunday ? (
                <>
                  Your week, <em>replayed</em>.
                </>
              ) : (
                <>
                  The weekly <em>replay</em>.
                </>
              )
            }
            desc={
              sunday ? (
                "Ten slides, two minutes. Unlocked this morning — watch it before the week starts again."
              ) : (
                <>
                  So far <span className={weekNet > 0.004 ? "num text-pos" : weekNet < -0.004 ? "num text-neg" : "num"}>{fmtMoney(weekly?.net ?? weekNet, { sign: true })}</span>
                  {weekly?.trades ? ` across ${weekly.trades} trades` : ""}. The full replay unlocks Sunday; the preview is open now.
                </>
              )
            }
            right={<span className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase">{sunday ? "Play →" : "Preview →"}</span>}
          />
          {prop && (
            <Row
              i="02"
              d={80}
              href="/guardian"
              title={
                prop.breached ? (
                  <>
                    Max loss <em>breached</em>.
                  </>
                ) : (
                  <>
                    {fmtMoney(prop.cushion)} above the <em>line</em>.
                  </>
                )
              }
              desc={
                <>
                  {settings.prop.firm} Guardian · {settings.prop.phase}.{" "}
                  {prop.targetProgress !== null ? `${fmtPct(prop.targetProgress)} of the way to target.` : "No profit target set."}
                  {prop.dailyLossUsed !== null && prop.dailyLossUsed > 0 ? ` ${fmtPct(prop.dailyLossUsed)} of today's loss limit used.` : ""}
                </>
              }
              right={<span className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase">Open →</span>}
            >
              <div className="mt-[clamp(1.4rem,3.5vh,2.2rem)] md:ml-[calc(2.5rem+clamp(1.2rem,4vw,3.5rem))]">
                <LimitLine closeness={1 - Math.max(0, Math.min(1, prop.cushionPct))} label="MAX LOSS" height={72} />
              </div>
            </Row>
          )}
          {!reviewed && (
            <Row
              i={prop ? "03" : "02"}
              d={160}
              href={`/journal/${today}`}
              title={
                <>
                  Two lines on <em>today</em>.
                </>
              }
              desc="Future you will read them. Write tonight's review and the reflect ring closes."
              right={<span className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase">Write →</span>}
            />
          )}
        </Rows>

        {capsule && (
          <div className="pt-[clamp(6rem,16vh,11rem)]">
            <CapsuleCard capsule={capsule} today={today} goals={capsuleGoals} />
          </div>
        )}
      </Chapter>

      <footer className="reveal flex flex-col items-center gap-5 pt-[clamp(3rem,8vh,5rem)] pb-[clamp(2rem,6vh,4rem)] text-center">
        <span className="text-[11px] text-gold">◆</span>
        <p className="font-serif text-[clamp(1.3rem,2.6vw,1.9rem)] leading-[1.3] font-light tracking-[-0.01em] italic">
          {reviewed ? "Rest well. See you at the open." : "The rest is execution."}
        </p>
        <p className="font-mono text-[9.5px] tracking-[0.32em] text-ink-4 uppercase">
          Day {dayNumber} · {closedAt ? `Session closed ${closedAt}` : reviewed ? "Session closed" : "Session open"}
        </p>
      </footer>
    </div>
  );
}
