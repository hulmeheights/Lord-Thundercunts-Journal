import { getSettings } from "@/lib/data/settings";
import { missionDaysWithGoals } from "@/lib/analytics/missionGoals";
import { listTrades } from "@/lib/data/trades";
import { journaledDays, listCapsules, listJournalDays, pendingCapsuleCount } from "@/lib/data/journal";
import { listLedger } from "@/lib/data/ledger";
import { capsuleStatus, evaluateCapsule } from "@/lib/analytics/capsule";
import { CapsuleList, type CapsuleView } from "@/components/journal/CapsuleList";
import { Goals } from "@/components/journal/Goals";
import { listGoals, setGoalDone } from "@/lib/data/goals";
import { missionState } from "@/lib/analytics/mission";
import { checkGoal, type GoalProgress } from "@/lib/analytics/goalcheck";
import { photoCounts } from "@/lib/data/photos";
import { addDays, addMonths, endOfMonth, longDate, monthLabel, startOfMonth, todayKey } from "@/lib/analytics/time";
import { dailySeries, summarize } from "@/lib/analytics/stats";
import { fmtMoney, fmtPct } from "@/lib/format";
import { CalendarHeatmap, YearStrip, type CalendarDatum } from "@/components/charts/CalendarHeatmap";
import { CapsuleWriter } from "@/components/journal/CapsuleWriter";
import { Cue, Empty, LinkBtn, Meta, Num, PageHead, Panel, Row, Rows, Section, Stat, Stats } from "@/components/m";

export const metadata = { title: "Journal" };

const WRITTEN = (e: { review: string | null; lessons: string | null; wins: string | null; plan: string | null }) =>
  (e.review?.length ?? 0) + (e.lessons?.length ?? 0) + (e.wins?.length ?? 0) + (e.plan?.length ?? 0) > 0;

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const sp = await searchParams;
  const m = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? `${sp.m}-01` : startOfMonth(today);
  const end = endOfMonth(m);
  const year = Number(m.slice(0, 4));
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  const [trades, journaled, entries, pending, photos, capsules, ledger, goals] = await Promise.all([
    listTrades({ since: new Date(`${addDays(yStart, -1)}T00:00:00Z`), until: new Date(`${addDays(yEnd, 2)}T00:00:00Z`) }),
    journaledDays(yStart, yEnd),
    listJournalDays(addDays(today, -90), today),
    pendingCapsuleCount(today),
    photoCounts(addDays(today, -90), today),
    listCapsules(),
    listLedger(),
    listGoals(),
  ]);
  // Goals are measured from the oldest capsule's seal date, which can reach back before this year.
  const capFrom = capsules.reduce((m, c) => (c.createdAt < m ? c.createdAt : m), `${yStart}T00:00:00Z`);
  const capTrades = capFrom < `${yStart}T00:00:00Z` ? await listTrades({ since: new Date(addDays(capFrom.slice(0, 10), -1)) }) : trades;
  // The mission: every weekday since it began, read from your trades.
  const missionStart = settings.goals.missionStart ?? goals.reduce((m, g) => (g.createdAt.slice(0, 10) < m ? g.createdAt.slice(0, 10) : m), today);
  // The loaded trades only cover the year on screen, which may not be this one.
  const missionTrades = missionStart < yStart || today > yEnd ? await listTrades({ since: new Date(addDays(missionStart, -1)) }) : trades;
  const mDays = missionDaysWithGoals(missionTrades, settings.rules, tz, missionStart, today, settings.goals.counts, goals);
  // Trading goals that check themselves: rules kept, numbers reached, rates hit.
  const startOf = (g: (typeof goals)[number]) => g.startedOn ?? g.createdAt.slice(0, 10);
  const goalFrom = goals.reduce((m, g) => (g.measure && startOf(g) < m ? startOf(g) : m), missionStart);
  const goalTrades = goalFrom >= missionStart ? missionTrades : goalFrom < yStart || today > yEnd ? await listTrades({ since: new Date(addDays(goalFrom, -1)) }) : trades;
  const progress: Record<string, GoalProgress> = {};
  const autoReached: string[] = [];
  for (const g of goals) {
    if (!g.measure) continue;
    const p = checkGoal(g.measure, startOf(g), g.targetDay, { trades: goalTrades, ledger, rules: settings.rules, tz, today });
    progress[g.id] = p;
    if (!g.completedAt && p.status === "reached") {
      await setGoalDone(g.id, true);
      g.completedAt = new Date().toISOString();
      autoReached.push(g.id);
    }
  }
  const ms = missionState(mDays, goals.reduce((n, g) => n + g.steps.length, 0), goals.filter((g) => g.completedAt).length);
  const mission = { name: settings.goals.mission, altitude: ms.altitude, streak: ms.streak, burns: ms.burns, holds: ms.holds, leaks: ms.leaks, days: ms.days };

  const capsuleViews: CapsuleView[] = capsules.map((c) => ({
    capsule: c,
    status: capsuleStatus(c, today),
    results: evaluateCapsule(c, capTrades, ledger, tz, today),
    daysLeft: Math.max(0, Math.round((Date.parse(`${c.deliverOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)),
  }));

  const series = dailySeries(trades, tz);
  const data: Record<string, CalendarDatum> = {};
  for (const d of series) data[d.day] = { net: d.net, trades: d.trades };
  for (const d of journaled) data[d] = { ...(data[d] ?? { net: 0, trades: 0 }), journaled: true };

  const monthTrades = trades.filter((t) => t.exitTime.slice(0, 7) === m.slice(0, 7));
  const s = summarize(monthTrades);
  const monthDays = series.filter((d) => d.day >= m && d.day <= end);
  const green = monthDays.filter((d) => d.net > 0).length;
  const writtenMonth = journaled.filter((d) => d >= m && d <= end).length;
  const traded = monthDays.length;
  const best = monthDays.reduce<(typeof monthDays)[number] | null>((b, d) => (!b || d.net > b.net ? d : b), null);

  const written = entries.filter((e) => WRITTEN(e) || photos.has(e.day)).reverse().slice(0, 8);
  const netByDay = new Map(series.map((d) => [d.day, d.net]));
  const prev = addMonths(m, -1).slice(0, 7);
  const next = addMonths(m, 1).slice(0, 7);
  const isCurrent = m === startOfMonth(today);
  const wroteToday = journaled.includes(today);

  return (
    <>
      <PageHead
        eyebrow="Your story · day by day"
        title={
          <>
            Write it <em>down</em>.
          </>
        }
        sub="Three honest lines after every session. Over a year they become the only trading book written about you."
        meta={<Meta value={fmtMoney(s.net, { sign: true })} tone={s.net > 0 ? "pos" : s.net < 0 ? "neg" : null} caption={`${monthLabel(m)} · ${s.trades} trades`} />}
      >
        <LinkBtn href={`/journal/${today}`} variant="primary" size="lg">
          {wroteToday ? "Open today's page" : "Write today"}
        </LinkBtn>
        <Cue href="#month">↓ the month</Cue>
        <Cue href="#year">↓ the year</Cue>
      </PageHead>

      <Section
        id="month"
        n={1}
        label="The month"
        aside={
          <div className="flex items-center gap-6 font-mono text-[10px] tracking-[0.3em] uppercase">
            <Cue href={`/journal?m=${prev}#month`}>← {monthLabel(`${prev}-01`).split(" ")[0]}</Cue>
            {!isCurrent && <Cue href={`/journal?m=${next}#month`}>{monthLabel(`${next}-01`).split(" ")[0]} →</Cue>}
          </div>
        }
        lead={
          <>
            {monthLabel(m).split(" ")[0]}, in <em>{traded}</em> sessions.
          </>
        }
      >
        <div className="reveal">
          <CalendarHeatmap month={m} data={data} today={today} hrefFor={(d) => `/journal/${d}`} />
        </div>
        <div className="reveal mt-5 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase">
          <span>
            <i className="mr-2 inline-block h-2.5 w-[2px] bg-pos align-middle" />
            Green day
          </span>
          <span>
            <i className="mr-2 inline-block h-2.5 w-[2px] bg-neg align-middle" />
            Red day
          </span>
          <span>
            <span className="mr-2 text-gold">◆</span>Written
          </span>
        </div>
        <Stats className="mt-[clamp(3rem,8vh,5rem)]">
          <Stat value={`${green}/${traded || 0}`} label="Green sessions" sub={traded ? `${fmtPct(green / traded)} of days you traded` : "No sessions yet"} />
          <Stat value={fmtPct(s.winRate)} label="Win rate" sub={`${s.wins} won · ${s.losses} lost`} d={80} />
          <Stat value={writtenMonth} label="Pages written" sub={traded ? `${fmtPct(Math.min(1, writtenMonth / traded))} of sessions reviewed` : "—"} d={160} />
          <Stat value={best ? <Num value={best.net} compact /> : "—"} label="Best day" sub={best ? longDate(best.day) : "—"} d={240} />
        </Stats>
      </Section>

      <Section id="year" n={2} label={`The year · ${year}`} lead={<>Every session you&apos;ve <em>lived</em> through.</>}>
        <div className="reveal">
          <YearStrip year={year} data={data} today={today} hrefFor={(d) => `/journal/${d}`} />
        </div>
      </Section>

      <Section n={3} label="Pages" lead={<>What you <em>told</em> yourself.</>}>
        {written.length === 0 ? (
          <Empty title={<>No pages yet. <em>Three lines</em> is enough.</>} action={<LinkBtn href={`/journal/${today}`}>Write today</LinkBtn>}>
            What you saw, what you felt, what you did. The coach and the Observer read every word.
          </Empty>
        ) : (
          <Rows>
            {written.map((e, i) => {
              const net = netByDay.get(e.day);
              const [wd, ...rest] = longDate(e.day).split(", ");
              return (
                <Row
                  key={e.day}
                  href={`/journal/${e.day}`}
                  i={`${e.day.slice(8)}·${e.day.slice(5, 7)}`}
                  title={
                    <>
                      {wd}
                      {rest.length ? <>, <em>{rest.join(", ")}</em></> : null}
                    </>
                  }
                  desc={
                    <>
                      <span className="line-clamp-3">{e.review || e.lessons || e.wins || e.plan || "Photos only."}</span>
                      {photos.get(e.day) ? (
                        <span className="mt-2 block font-mono text-[9px] tracking-[0.3em] text-gold uppercase">
                          ◆ {photos.get(e.day)} photo{photos.get(e.day) === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </>
                  }
                  right={net !== undefined ? <Num value={net} /> : <span className="text-ink-4">—</span>}
                  d={i * 50}
                />
              );
            })}
          </Rows>
        )}
      </Section>

      <Section id="goals" n={4} label="Goals" lead={<>The <em>mission</em>, flown by your discipline.</>}>
        <Goals goals={goals} today={today} mission={mission} progress={progress} autoReached={autoReached} defaults={{ start: settings.rules.sessionStart, end: settings.rules.sessionEnd }} counts={settings.goals.counts} />
      </Section>

      <Section id="capsules" n={5} label="Time capsule">
        <Panel gold className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="font-serif text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.15] font-light tracking-[-0.01em]">
              Dear future <em>me</em>.
            </p>
            <p className="mt-5 max-w-[38ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2">
              Write to the trader you&apos;ll be, and seal goals with it if you like. It stays sealed, then opens on Today (and in your replay)
              on the day it&apos;s due — and the goals are checked against your trades and ledger.
              {pending > 0 && (
                <>
                  {" "}
                  <span className="text-gold">◆ {pending} on the way.</span>
                </>
              )}
            </p>
          </div>
          <CapsuleWriter pending={pending} />
        </Panel>
        <CapsuleList items={capsuleViews} />
      </Section>
    </>
  );
}
