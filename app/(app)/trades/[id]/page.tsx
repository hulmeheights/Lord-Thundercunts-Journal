import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/data/settings";
import { getTrade, listTrades } from "@/lib/data/trades";
import { addDays, dayKey, holdMinutes, timeInTz } from "@/lib/analytics/time";
import { evaluateRules, RULE_LABELS } from "@/lib/analytics/rules";
import { detectTilt } from "@/lib/analytics/tilt";
import { rMultiple, sortByEntry } from "@/lib/analytics/stats";
import { fmtMoney, fmtNum, fmtPrice } from "@/lib/format";
import { Cue, Label, Lead, Num, PageHead, Row, Rows, Stat, Stats } from "@/components/m";
import { Odometer } from "@/components/motion/Odometer";
import { TradeEditor } from "@/components/trades/TradeEditor";
import { ChartFrame } from "@/components/trades/ChartFrame";
import { PriceTrace } from "@/components/trades/PriceTrace";
import { chartImage, dayLabel, holdParts, pointsFor, sourceLabel, spell } from "@/components/trades/lib";

export const metadata = { title: "Trade" };

function holdWords(min: number): string {
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} seconds`;
  if (min < 60) {
    const m = Math.round(min);
    return `${spell(m)} minute${m === 1 ? "" : "s"}`;
  }
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = await getTrade(decodeURIComponent(id));
  if (!trade) notFound();
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const day = dayKey(trade.entryTime, tz);
  const sameDay = sortByEntry(
    (await listTrades({ since: new Date(`${addDays(day, -1)}T00:00:00Z`), until: new Date(`${addDays(day, 2)}T00:00:00Z`) })).filter((t) => dayKey(t.entryTime, tz) === day),
  );
  const rules = evaluateRules(sameDay, settings.rules, tz).violations.filter((v) => v.tradeIds.includes(trade.id));
  const tilt = detectTilt(sameDay, tz).flags.find((f) => f.tradeId === trade.id);

  const idx = sameDay.findIndex((t) => t.id === trade.id);
  const prev = idx > 0 ? sameDay[idx - 1] : undefined;
  const next = idx >= 0 && idx < sameDay.length - 1 ? sameDay[idx + 1] : undefined;

  const long = trade.direction === "long";
  const pts = pointsFor(trade);
  const held = holdMinutes(trade.entryTime, trade.exitTime);
  const hp = holdParts(held);
  const risk = trade.plannedRisk ?? settings.rules.defaultRisk;
  const r = rMultiple(trade, settings.rules.defaultRisk);
  const flags = rules.length + (tilt ? 1 : 0);
  const n = { trade: 1, numbers: 2, rules: 3, journal: flags ? 4 : 3 };
  const inT = timeInTz(trade.entryTime, tz);
  const outT = timeInTz(trade.exitTime, tz);

  const sub =
    pts > 0
      ? `In at ${fmtPrice(trade.entryPrice)}, out at ${fmtPrice(trade.exitPrice)} — ${fmtNum(pts, 2)} points in ${holdWords(held)}.`
      : pts < 0
        ? `In at ${fmtPrice(trade.entryPrice)}, out at ${fmtPrice(trade.exitPrice)} — ${fmtNum(-pts, 2)} points against, over ${holdWords(held)}.`
        : `In and out at ${fmtPrice(trade.entryPrice)} — flat, after ${holdWords(held)}.`;

  return (
    <div>
      <div className="reveal pt-2 sm:pt-4">
        <Cue href="/trades">← The tape</Cue>
      </div>

      <PageHead
        eyebrow={
          <>
            <Link href={`/journal/${day}`} className="transition-colors duration-300 hover:text-ink">
              {dayLabel(day)}
            </Link>
            {idx >= 0 && sameDay.length > 1 && <> · Trade {idx + 1} of {sameDay.length}</>}
            {" · "}
            {sourceLabel(trade.source)}
          </>
        }
        title={
          <>
            {trade.root} · <em>{long ? "Long" : "Short"}</em> ×{trade.qty}
          </>
        }
        sub={sub}
        meta={
          <div>
            <Odometer value={trade.netPnl} decimals={2} className="text-[clamp(2.4rem,5.4vw,4.4rem)] leading-none font-light" delay={250} />
            <div className="mt-3 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">Net · after {fmtMoney(trade.fees, { cents: true })} fees</div>
          </div>
        }
      />

      {/* 01 — the trade, framed */}
      <section className="py-[clamp(2rem,6vh,4rem)]">
        <div className="reveal mb-[clamp(2rem,5vh,3rem)]">
          <Label n={n.trade}>The trade</Label>
        </div>
        <ChartFrame
          image={chartImage(trade.chartUrl)}
          href={trade.chartUrl}
          caption={
            <>
              Fig. 01 — {trade.symbol} · {dayLabel(day)} · {inT} → {outT}
            </>
          }
        >
          <PriceTrace trade={trade} tz={tz} defaultRisk={settings.rules.defaultRisk} />
        </ChartFrame>
      </section>

      {/* 02 — the numbers */}
      <section className="py-[clamp(4rem,10vh,8rem)]">
        <div className="reveal mb-[clamp(2rem,5vh,3rem)]">
          <Label n={n.numbers}>The numbers</Label>
        </div>
        <Stats cols={3} className="gap-y-14 [&_.num]:!text-[clamp(1.75rem,3.6vw,3.1rem)]">
          <Stat value={fmtPrice(trade.entryPrice)} label="Entry" sub={`${inT} · ${long ? "bought" : "sold short"}`} />
          <Stat value={fmtPrice(trade.exitPrice)} label="Exit" sub={`${outT} · ${long ? "sold" : "covered"}`} d={60} />
          <Stat value={hp.value} unit={hp.unit} label="Held" sub={`${trade.fillCount} fill${trade.fillCount === 1 ? "" : "s"}`} d={120} />
          <Stat
            value={r !== null ? `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmtNum(Math.abs(r), 2)}` : "—"}
            unit={r !== null ? "R" : undefined}
            tone={r === null ? null : r > 0 ? "pos" : r < 0 ? "neg" : null}
            label="R multiple"
            sub={risk ? `On ${fmtMoney(risk)} planned risk` : "Set a planned risk below"}
            d={180}
          />
          <Stat value={fmtMoney(trade.fees, { cents: true })} label="Fees" sub={`Gross ${fmtMoney(trade.grossPnl, { sign: true, cents: true })}`} d={240} />
          <Stat
            value={trade.qty}
            unit={trade.qty === 1 ? "contract" : "contracts"}
            label="Size"
            sub={trade.maxPosition && trade.maxPosition !== trade.qty ? `Up to ${trade.maxPosition} on at once` : `$${fmtNum(trade.pointValue, trade.pointValue % 1 ? 2 : 0)} a point`}
            d={300}
          />
        </Stats>
      </section>

      {/* 03 — what the rules saw */}
      {flags > 0 && (
        <section className="py-[clamp(3rem,8vh,6rem)]">
          <div className="reveal mb-[clamp(2rem,5vh,3rem)]">
            <Label n={n.rules}>What the rules saw</Label>
          </div>
          <Rows>
            {rules.map((v, i) => (
              <Row key={v.rule} i={String(i + 1).padStart(2, "0")} title={RULE_LABELS[v.rule]} desc={v.detail} />
            ))}
            {tilt && (
              <Row
                i={String(rules.length + 1).padStart(2, "0")}
                title={
                  <>
                    Tilt, <em>{tilt.severity >= 3 ? "loud" : tilt.severity === 2 ? "rising" : "faint"}</em>
                  </>
                }
                desc={tilt.reasons.join(" · ")}
              />
            )}
          </Rows>
        </section>
      )}

      {/* 04 — the journal */}
      <section className="py-[clamp(4rem,10vh,8rem)]">
        <div className="reveal mb-[clamp(2rem,5vh,3rem)]">
          <Label n={n.journal}>The journal</Label>
        </div>
        <Lead className="mb-[clamp(2.5rem,7vh,4.5rem)]">
          What were you <em>thinking</em>?
        </Lead>
        <TradeEditor trade={trade} vocab={settings.vocab} defaultRisk={settings.rules.defaultRisk} />
      </section>

      {/* the session, either side */}
      {(prev || next) && (
        <nav aria-label="Same session" className="reveal grid grid-cols-2 gap-6 border-t border-line pt-8 pb-6">
          {prev ? (
            <Link href={`/trades/${encodeURIComponent(prev.id)}`} className="group min-w-0">
              <div className="font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase transition-colors group-hover:text-ink-2">← Earlier</div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[13px]">
                <span className="text-ink-3">{timeInTz(prev.entryTime, tz)}</span>
                <span className="tracking-[0.08em] text-ink">{prev.root}</span>
                <Num value={prev.netPnl} />
              </div>
            </Link>
          ) : (
            <div className="font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">First of the session</div>
          )}
          {next ? (
            <Link href={`/trades/${encodeURIComponent(next.id)}`} className="group min-w-0 text-right">
              <div className="font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase transition-colors group-hover:text-ink-2">Later →</div>
              <div className="mt-3 flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 font-mono text-[13px]">
                <span className="text-ink-3">{timeInTz(next.entryTime, tz)}</span>
                <span className="tracking-[0.08em] text-ink">{next.root}</span>
                <Num value={next.netPnl} />
              </div>
            </Link>
          ) : (
            <div className="text-right font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">Last of the session</div>
          )}
        </nav>
      )}
    </div>
  );
}
