import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { journaledDays, listJournalDays, pendingCapsuleCount } from "@/lib/data/journal";
import { addDays, addMonths, endOfMonth, longDate, monthLabel, startOfMonth, todayKey } from "@/lib/analytics/time";
import { dailySeries, summarize } from "@/lib/analytics/stats";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { CalendarHeatmap, type CalendarDatum } from "@/components/charts/CalendarHeatmap";
import { CapsuleWriter } from "@/components/journal/CapsuleWriter";
import { LinkButton } from "@/components/ui/Button";

export const metadata = { title: "Journal" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  const sp = await searchParams;
  const m = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? `${sp.m}-01` : startOfMonth(today);
  const end = endOfMonth(m);
  const [trades, journaled, entries, pending] = await Promise.all([
    listTrades({ since: new Date(`${addDays(m, -1)}T00:00:00Z`), until: new Date(`${addDays(end, 2)}T00:00:00Z`) }),
    journaledDays(m, end),
    listJournalDays(addDays(today, -60), today),
    pendingCapsuleCount(today),
  ]);
  const days = dailySeries(trades, tz).filter((d) => d.day >= m && d.day <= end);
  const data: Record<string, CalendarDatum> = {};
  for (const d of days) data[d.day] = { net: d.net, trades: d.trades };
  for (const d of journaled) data[d] = { ...(data[d] ?? { net: 0, trades: 0 }), journaled: true };
  const monthTrades = trades.filter((t) => t.exitTime.slice(0, 7) === m.slice(0, 7));
  const s = summarize(monthTrades);
  const written = entries.filter((e) => (e.review?.length ?? 0) + (e.lessons?.length ?? 0) + (e.wins?.length ?? 0) > 0).reverse().slice(0, 8);
  const netByDay = new Map(dailySeries(trades, tz).map((d) => [d.day, d.net]));
  const prev = addMonths(m, -1).slice(0, 7);
  const next = addMonths(m, 1).slice(0, 7);

  return (
    <>
      <PageHeader eyebrow="Your story, day by day" title="Journal">
        <LinkButton href={`/journal/${today}`} variant="primary">
          Write today
        </LinkButton>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="title-lg">{monthLabel(m)}</div>
              <div className="mt-0.5 text-[13px] text-ink-3">
                <span className={cn("num font-semibold", s.net >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(s.net, { sign: true })}</span> ·{" "}
                {s.trades} trades · {fmtPct(s.winRate)} win rate
              </div>
            </div>
            <div className="flex gap-1.5">
              <Link href={`/journal?m=${prev}`} className="grid h-9 w-9 place-items-center rounded-full bg-fill-2 text-ink-2 hover:text-ink" aria-label="Previous month">
                <ChevronLeft size={17} />
              </Link>
              <Link href={`/journal?m=${next}`} className="grid h-9 w-9 place-items-center rounded-full bg-fill-2 text-ink-2 hover:text-ink" aria-label="Next month">
                <ChevronRight size={17} />
              </Link>
            </div>
          </div>
          <CalendarHeatmap month={m} data={data} today={today} hrefFor={(d) => `/journal/${d}`} />
          <div className="mt-4 flex items-center gap-4 text-[11.5px] text-ink-3">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-pos/60" /> Green day</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-neg/60" /> Red day</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-cyan" /> Journaled</span>
          </div>
        </Card>
        <div className="space-y-5 lg:col-span-4">
          <Card>
            <CardHeader eyebrow="Time capsule" title="Dear future me" />
            <CapsuleWriter pending={pending} />
          </Card>
        </div>
      </div>

      <section className="mt-7">
        <div className="eyebrow mb-3">Recent entries</div>
        {written.length === 0 ? (
          <Card className="text-[14px] text-ink-3">No written reviews yet. Three honest lines after each session is all it takes.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {written.map((e) => {
              const net = netByDay.get(e.day);
              return (
                <Link key={e.day} href={`/journal/${e.day}`} className="glass block rounded-[22px] p-5 transition-transform hover:scale-[1.01]">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[14px] font-semibold">{longDate(e.day)}</span>
                    {net !== undefined && <span className={cn("num text-[13px] font-semibold", net >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(net, { sign: true })}</span>}
                  </div>
                  <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-ink-2">{e.review || e.lessons || e.wins}</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
