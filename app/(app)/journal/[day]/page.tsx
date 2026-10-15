import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, PlayCircle } from "lucide-react";
import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { getJournalDay } from "@/lib/data/journal";
import { addDays, dayKey, longDate, timeInTz, todayKey } from "@/lib/analytics/time";
import { summarize } from "@/lib/analytics/stats";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { aiConfigured } from "@/lib/env";
import { Card, CardHeader } from "@/components/ui/Card";
import { DayEditor } from "@/components/journal/DayEditor";
import { Readiness } from "@/components/today/Readiness";
import { Ritual } from "@/components/today/Ritual";

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/journal" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-3 hover:text-ink">
          <ChevronLeft size={17} /> Journal
        </Link>
        <div className="flex gap-1.5">
          <Link href={`/journal/${addDays(day, -1)}`} className="grid h-9 w-9 place-items-center rounded-full bg-fill-2 text-ink-2 hover:text-ink" aria-label="Previous day">
            <ChevronLeft size={17} />
          </Link>
          {day < today && (
            <Link href={`/journal/${addDays(day, 1)}`} className="grid h-9 w-9 place-items-center rounded-full bg-fill-2 text-ink-2 hover:text-ink" aria-label="Next day">
              <ChevronRight size={17} />
            </Link>
          )}
        </div>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">{day === today ? "Today" : "Journal entry"}</div>
          <h1 className="title-xl">{longDate(day)}</h1>
        </div>
        <div className="text-right">
          <div className={cn("num text-[34px] font-bold tracking-[-0.03em]", s.net > 0 ? "text-pos" : s.net < 0 ? "text-neg" : "text-ink-2")}>
            {fmtMoney(s.net, { sign: true })}
          </div>
          <div className="text-[13px] text-ink-3">
            {s.trades} trades{s.trades ? ` · ${fmtPct(s.winRate)} win rate` : ""}
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <Card>
            <DayEditor day={day} journal={journal} customRules={settings.rules.custom} aiEnabled={aiConfigured() && settings.ai.enabled} />
          </Card>
        </div>
        <div className="space-y-5 lg:col-span-5">
          <Card padded={false}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="eyebrow">Trades</div>
              <Link href={`/briefing/daily?date=${day}`} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-cyan">
                <PlayCircle size={15} /> Play briefing
              </Link>
            </div>
            {dayTrades.length === 0 ? (
              <div className="px-5 pb-5 text-[13.5px] text-ink-3">No trades this day.</div>
            ) : (
              <div className="divide-y divide-line border-t border-line">
                {dayTrades.map((t) => (
                  <Link key={t.id} href={`/trades/${encodeURIComponent(t.id)}`} className="flex items-center gap-3 px-5 py-3 hover:bg-fill">
                    {t.direction === "long" ? <ArrowUpRight size={16} className="text-pos" /> : <ArrowDownRight size={16} className="text-neg" />}
                    <span className="text-[14px] font-semibold">{t.root}</span>
                    <span className="num text-[12.5px] text-ink-3">
                      {timeInTz(t.entryTime, tz)} ×{t.qty}
                    </span>
                    {t.setup && <span className="hidden truncate text-[12px] text-ink-3 sm:inline">{t.setup}</span>}
                    <span className={cn("num ml-auto text-[14px] font-semibold", t.netPnl >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(t.netPnl, { sign: true })}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader eyebrow="Readiness" title="Mind before market" />
            <Readiness day={day} initial={journal.readiness} initialIntention={journal.intention} insight={null} />
          </Card>
          <Card>
            <CardHeader eyebrow="Ritual" title="Checklist" />
            <Ritual day={day} items={settings.ritual} checklist={journal.checklist} tasks={journal.tasks} />
          </Card>
        </div>
      </div>
    </div>
  );
}
