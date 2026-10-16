import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { getJournalDay } from "@/lib/data/journal";
import { addDays, dayKey, longDate, timeInTz, todayKey } from "@/lib/analytics/time";
import { summarize } from "@/lib/analytics/stats";
import { fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { aiConfigured } from "@/lib/env";
import { DayEditor } from "@/components/journal/DayEditor";
import { Readiness } from "@/components/today/Readiness";
import { Ritual } from "@/components/today/Ritual";
import { Cue, Meta, PageHead, Section } from "@/components/m";

export const metadata = { title: "Journal" };

export default async function JournalDayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T00:00:00Z`).getTime())) notFound();
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const [journal, trades] = await Promise.all([
    getJournalDay(day),
    listTrades({ since: new Date(`${addDays(day, -1)}T00:00:00Z`), until: new Date(`${addDays(day, 2)}T00:00:00Z`) }),
  ]);
  const dayTrades = trades.filter((t) => dayKey(t.exitTime, tz) === day).sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  const s = summarize(dayTrades);
  const [weekday, date] = longDate(day).split(", ");
  const isToday = day === today;

  return (
    <>
      <nav className="flex items-center justify-between pt-4 font-mono text-[10px] tracking-[0.3em] uppercase">
        <Cue href="/journal">← Journal</Cue>
        <div className="flex gap-7">
          <Cue href={`/journal/${addDays(day, -1)}`}>← Prev</Cue>
          {day < today && <Cue href={`/journal/${addDays(day, 1)}`}>Next →</Cue>}
        </div>
      </nav>

      <PageHead
        eyebrow={`${isToday ? "Today" : "Journal"} · ${day.slice(0, 4)}`}
        title={
          <>
            {weekday}, <em>{date}</em>.
          </>
        }
        meta={
          <Meta
            value={fmtMoney(s.net, { sign: true })}
            tone={s.net > 0.004 ? "pos" : s.net < -0.004 ? "neg" : null}
            caption={s.trades ? `${s.trades} trades · ${fmtPct(s.winRate)} won` : "No trades"}
          />
        }
      >
        <Cue href={`/briefing/daily?date=${day}`} className="text-ink-2">
          ▸ Play the day&apos;s replay
        </Cue>
      </PageHead>

      <div className="grid gap-x-[clamp(3rem,7vw,7rem)] gap-y-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <DayEditor day={day} journal={journal} customRules={settings.rules.custom} aiEnabled={aiConfigured() && settings.ai.enabled} />
        </div>

        <aside className="min-w-0 lg:pt-1">
          <div className="reveal">
            <div className="label mb-5">The tape</div>
            {dayTrades.length === 0 ? (
              <p className="border-t border-line pt-5 font-mono text-[11.5px] leading-[1.9] text-ink-3">No trades this day. Sitting out is a position.</p>
            ) : (
              <div className="border-t border-line">
                {dayTrades.map((t) => {
                  const win = t.netPnl > 0.004;
                  const loss = t.netPnl < -0.004;
                  return (
                    <Link
                      key={t.id}
                      href={`/trades/${encodeURIComponent(t.id)}`}
                      className="m-row grid grid-cols-[3rem_1fr_auto] items-baseline gap-3 border-b border-line py-3.5 font-mono"
                    >
                      <span className="num text-[10.5px] tracking-[0.06em] text-ink-4">{timeInTz(t.entryTime, tz)}</span>
                      <span className="min-w-0 truncate text-[11.5px] tracking-[0.06em]">
                        <span className="text-ink">{t.root}</span>{" "}
                        <span className="text-ink-4 uppercase">
                          {t.direction} ×{t.qty} · {fmtPrice(t.entryPrice)}
                        </span>
                      </span>
                      <span className={cn("num text-[12px]", win ? "text-pos" : loss ? "text-neg" : "text-ink-3")}>{fmtMoney(t.netPnl, { sign: true })}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      <Section n={7} label="Before the bell" lead={<>Mind before <em>market</em>.</>}>
        <div className="grid gap-x-[clamp(3rem,7vw,7rem)] gap-y-16 lg:grid-cols-2">
          <Readiness day={day} initial={journal.readiness} initialIntention={journal.intention} insight={null} />
          <Ritual day={day} items={settings.ritual} checklist={journal.checklist} tasks={journal.tasks} />
        </div>
      </Section>
    </>
  );
}
