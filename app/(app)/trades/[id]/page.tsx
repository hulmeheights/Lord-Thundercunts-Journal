import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ExternalLink, Flame, ShieldAlert } from "lucide-react";
import { getSettings } from "@/lib/data/settings";
import { getTrade, listTrades } from "@/lib/data/trades";
import { addDays, dayKey, fmtHold, holdMinutes, longDate, timeInTz } from "@/lib/analytics/time";
import { evaluateRules } from "@/lib/analytics/rules";
import { detectTilt } from "@/lib/analytics/tilt";
import { fmtMoney, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { NumberTicker } from "@/components/ui/NumberTicker";
import { TradeEditor } from "@/components/trades/TradeEditor";

export const metadata = { title: "Trade" };

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = await getTrade(decodeURIComponent(id));
  if (!trade) notFound();
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const day = dayKey(trade.entryTime, tz);
  const sameDay = (await listTrades({ since: new Date(`${addDays(day, -1)}T00:00:00Z`), until: new Date(`${addDays(day, 2)}T00:00:00Z`) })).filter(
    (t) => dayKey(t.entryTime, tz) === day,
  );
  const rules = evaluateRules(sameDay, settings.rules, tz).violations.filter((v) => v.tradeIds.includes(trade.id));
  const tilt = detectTilt(sameDay, tz).flags.find((f) => f.tradeId === trade.id);
  const long = trade.direction === "long";

  const facts = [
    ["Entry", `${fmtPrice(trade.entryPrice)} · ${timeInTz(trade.entryTime, tz)}`],
    ["Exit", `${fmtPrice(trade.exitPrice)} · ${timeInTz(trade.exitTime, tz)}`],
    ["Contracts", `${trade.qty}${trade.maxPosition && trade.maxPosition !== trade.qty ? ` (max ${trade.maxPosition})` : ""}`],
    ["Held", fmtHold(holdMinutes(trade.entryTime, trade.exitTime))],
    ["Gross", fmtMoney(trade.grossPnl, { sign: true })],
    ["Fees", fmtMoney(-trade.fees)],
    ["Points", `${fmtPrice(Math.abs(trade.exitPrice - trade.entryPrice))}`],
    ["Source", trade.source === "topstepx" ? "TopstepX" : trade.source === "tradovate" ? "Tradovate" : trade.source === "sample" ? "Sample" : "Manual"],
  ];

  return (
    <div className="space-y-5">
      <Link href="/trades" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-3 hover:text-ink">
        <ChevronLeft size={17} /> Trades
      </Link>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5">
          <Card>
            <div className="flex items-center gap-3">
              <div className={cn("grid h-12 w-12 place-items-center rounded-[3px]", long ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg")}>
                {long ? <ArrowUpRight size={22} /> : <ArrowDownRight size={22} />}
              </div>
              <div>
                <div className="text-[22px] font-bold tracking-[-0.02em]">{trade.symbol}</div>
                <div className="text-[13px] text-ink-3">
                  {long ? "Long" : "Short"} · <Link href={`/journal/${day}`} className="hover:text-ink">{longDate(day)}</Link>
                </div>
              </div>
            </div>
            <div className={cn("mt-6 text-[52px] leading-none font-bold tracking-[-0.045em]", trade.netPnl >= 0 ? "text-pos" : "text-neg")}>
              <NumberTicker value={trade.netPnl} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3.5">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <div className="text-[12px] text-ink-3">{k}</div>
                  <div className="num text-[14.5px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
            {trade.chartUrl && (
              <a href={trade.chartUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-cyan">
                <ExternalLink size={14} /> Open chart
              </a>
            )}
          </Card>

          {(rules.length > 0 || tilt) && (
            <Card>
              <div className="eyebrow mb-3 text-orange">Flags on this trade</div>
              <div className="space-y-2.5">
                {rules.map((v) => (
                  <div key={v.rule} className="flex gap-2.5 text-[14px]">
                    <ShieldAlert size={17} className="mt-0.5 shrink-0 text-purple" />
                    <span>{v.detail}</span>
                  </div>
                ))}
                {tilt?.reasons.map((r) => (
                  <div key={r} className="flex gap-2.5 text-[14px]">
                    <Flame size={17} className="mt-0.5 shrink-0 text-orange" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card className="lg:col-span-7">
          <TradeEditor trade={trade} vocab={settings.vocab} defaultRisk={settings.rules.defaultRisk} />
        </Card>
      </div>
    </div>
  );
}
