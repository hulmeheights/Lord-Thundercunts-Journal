import { Section, Stat, Stats } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import type { AccountYear, Edge, Row } from "@/lib/analytics/scale";
import { edgeBreakdowns } from "@/lib/analytics/scale";

/** Which grades count: a set of grades, or null for every trade (graded or not). */
export type ScaleView = { window: boolean; grades: string[] | null; risk: number | "actual"; days: "90" | "365" | "all" };
const GRADE_CHOICES = ["A+", "A", "B", "C", "F"];
export function scaleHref(v: ScaleView): string {
  return `/guardian?sw=${v.window ? 1 : 0}&sg=${v.grades ? encodeURIComponent(v.grades.join(",")) : "all"}&sr=${v.risk}&sd=${v.days}#scale`;
}
export const SCALE_RISKS = [100, 150, 200, 250, 300, 600];
export const SCALE_ACCOUNTS = [1, 5, 10, 15];

const r2 = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`);
const mins = (m: number) => (m < 1 ? `${Math.round(m * 60)}s` : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Guardian → Scale: is your own edge ready to copy across accounts, and what a year of it could look like. */
/** One breakdown table: name · trades · win rate (bar) · PF · net. */
function Table({ title, rows, unit = "trades" }: { title: string; rows: Row[]; unit?: string }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="mb-2 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">{title}</div>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,8.5rem)_2.6rem_minmax(0,1fr)_3rem_5.2rem] items-center gap-x-2 border-b border-line py-1.5 font-mono text-[10.5px]">
            <span className="truncate text-ink-2">{r.key}</span>
            <span className="text-ink-4" title={unit}>{r.n}</span>
            <span className="flex items-center gap-2">
              <span className="relative h-[2px] flex-1 bg-line">
                <i className={cn("absolute top-0 left-0 block h-[2px]", (r.winRate ?? 0) >= 0.5 ? "bg-pos" : "bg-gold")} style={{ width: `${(r.winRate ?? 0) * 100}%` }} />
              </span>
              <span className="w-8 text-right text-ink">{pct(r.winRate)}</span>
            </span>
            <span className="text-right text-ink-4">{r.pf === null ? "—" : Number.isFinite(r.pf) ? r.pf.toFixed(2) : "∞"}</span>
            <span className={cn("num text-right", r.net > 0 ? "text-pos" : r.net < 0 ? "text-neg" : "text-ink-4")}>{fmtMoney(r.net, { sign: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScaleSection({ n, edge, year, view, windowLabel, tz }: { n: number; edge: Edge; year: AccountYear | null; view: ScaleView; windowLabel: string | null; tz: string }) {
  const bd = edgeBreakdowns(edge, tz);
  const risk = view.risk;
  const sd = view.days;
  const go = (p: Partial<ScaleView>) => scaleHref({ ...view, ...p });
  const toggleGrade = (g: string) => {
    const cur = view.grades ?? [];
    const next = cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g];
    return go({ grades: next.length ? GRADE_CHOICES.filter((x) => next.includes(x)) : null });
  };
  const chip = (on: boolean) => cn("border px-2.5 py-1 font-mono text-[10.5px] transition-colors", on ? "border-gold/70 bg-gold/10 text-ink" : "border-line text-ink-4 hover:text-ink-2");
  return (
    <Section
      id="scale"
      n={n}
      label="Scale"
      lead={
        <>
          One good trade, copied to <em>many</em> accounts.
        </>
      }
    >
      {/* What to measure: change any of these and everything below follows. */}
      <div className="space-y-3 border border-line-2 p-4 font-mono text-[10.5px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[9px] tracking-[0.24em] text-ink-4 uppercase">When</span>
          <a href={go({ window: true })} className={chip(view.window)}>
            Only my window{windowLabel ? ` (${windowLabel})` : ""}
          </a>
          <a href={go({ window: false })} className={chip(!view.window)}>
            Any time of day
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[9px] tracking-[0.24em] text-ink-4 uppercase">Grades</span>
          {GRADE_CHOICES.map((g) => (
            <a key={g} href={toggleGrade(g)} className={chip(!!view.grades?.includes(g))}>
              {g}
            </a>
          ))}
          <a href={go({ grades: null })} className={chip(view.grades === null)}>
            Every trade (graded or not)
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-[9px] tracking-[0.24em] text-ink-4 uppercase">Period</span>
          {(["90", "365", "all"] as const).map((d) => (
            <a key={d} href={go({ days: d })} className={chip(sd === d)}>
              {d === "90" ? "90 days" : d === "365" ? "1 year" : "All"}
            </a>
          ))}
        </div>
        {view.window && !windowLabel && <p className="text-gold">No trading window set yet: set it in Settings → Trading rules, or pick &quot;Any time of day&quot;.</p>}
      </div>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink-3">
        How the count is made: {edge.funnel.period} trades in this period
        {edge.funnel.inWindow !== null && <> · {edge.funnel.inWindow} entered inside your window</>} · {edge.funnel.gradedAny} graded at all · {edge.funnel.aplusAnyTime} graded A+
        {edge.funnel.aplusOutsideWindow ? <> ({edge.funnel.aplusOutsideWindow} of them outside your window, left out)</> : null} · {edge.funnel.matching} match this view
        {edge.copiesFolded ? <> · {edge.copiesFolded} were copies on other accounts, counted once</> : null}
        {edge.noRisk ? <> · {edge.noRisk} left out with no 1R to measure</> : null} → <span className="text-ink">{edge.n} measured</span>.
      </p>
      {edge.n === 0 && view.grades && (
        <p className="mt-2 font-mono text-[10.5px] text-gold">No trades with those grades here yet. Grade your trades (Trades → each trade), or tick more grades / &quot;Every trade&quot;.</p>
      )}

      <Stats cols={4} className="mt-8">
        <Stat value={`${edge.n}`} label="Trades measured" sub={edge.tradesPerDay ? `${edge.tradesPerDay.toFixed(1)} a day · ${edge.daysPerMonth} days a month${edge.copiesFolded ? ` · ${edge.copiesFolded} copies folded in` : ""}` : "none yet"} />
        <Stat value={pct(edge.winRate)} label="Win rate" sub={edge.avgWinUsd !== null ? `avg win ${fmtMoney(edge.avgWinUsd)} · loss ${edge.avgLossUsd === null ? "—" : fmtMoney(edge.avgLossUsd)} (${r2(edge.avgWinR)} / ${r2(edge.avgLossR)})` : undefined} />
        <Stat value={edge.pf === null ? "—" : Number.isFinite(edge.pf) ? edge.pf.toFixed(2) : "∞"} label="Profit factor" tone={edge.pf !== null && edge.pf >= 1.3 ? "pos" : edge.pf !== null && edge.pf < 1 ? "neg" : null} />
        <Stat value={edge.n ? fmtMoney(edge.netUsd / edge.n, { sign: true }) : "—"} label="Per trade, on average" sub={`${r2(edge.expectancyR)} · net ${fmtMoney(edge.netUsd, { sign: true })} · worst losing run ${edge.worstStreak}`} tone={edge.netUsd > 0 ? "pos" : edge.n ? "neg" : null} />
      </Stats>

      <div className={cn("mt-10 border p-4 font-mono text-[11px]", edge.ready.ok ? "border-pos/50" : "border-gold/50")}>
        <div className={cn("text-[9.5px] tracking-[0.3em] uppercase", edge.ready.ok ? "text-pos" : "text-gold")}>{edge.ready.ok ? "Ready to scale" : "Not ready to scale yet"}</div>
        <ul className="mt-2 space-y-1">
          {edge.ready.checks.map((c) => (
            <li key={c.label} className="flex gap-3">
              <span className={c.ok ? "text-pos" : "text-ink-4"}>{c.ok ? "✓" : "○"}</span>
              <span className="text-ink-2">{c.label}</span>
              <span className="text-ink-4">· {c.value}</span>
            </li>
          ))}
        </ul>
        {!edge.ready.ok && <p className="mt-2 text-[10.5px] text-ink-4">Keep the size small until all three are ticked. Scaling an edge that isn&apos;t there just loses money faster, on every account at once.</p>}
      </div>

      {edge.n > 0 && (
        <div className="mt-12">
          <div className="mb-4 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">
            Where the money comes from · {bd.tradingDays} trading days · {pct(bd.greenDays)} green
          </div>
          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
            <Table title="By entry time (your time, 15 min)" rows={bd.byTime} />
            <Table title="By day of the week" rows={bd.byWeekday} />
            <Table title="Which trade of the day" rows={bd.byTradeOfDay} />
            <div>
              <Table title="How long you were in the trade" rows={bd.byHold} />
              {bd.holdWin !== null && (
                <p className="mt-2 font-mono text-[10px] text-ink-4">
                  Winners last {mins(bd.holdWin)} on average · losers {bd.holdLoss === null ? "—" : mins(bd.holdLoss)}
                </p>
              )}
            </div>
            <Table title="How many trades the day had (win rate = green days)" rows={bd.byDayCount} unit="days" />
            <div>
              <div className="mb-2 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Best days</div>
              <ul>
                {bd.bestDays.map((d) => (
                  <li key={d.day} className="flex justify-between border-b border-line py-1.5 font-mono text-[10.5px]">
                    <span className="text-ink-2">
                      {new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {d.n} {d.n === 1 ? "trade" : "trades"}
                    </span>
                    <span className={cn("num", d.net > 0 ? "text-pos" : "text-neg")}>{fmtMoney(d.net, { sign: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Worst days</div>
              <ul>
                {bd.worstDays.map((d) => (
                  <li key={d.day} className="flex justify-between border-b border-line py-1.5 font-mono text-[10.5px]">
                    <span className="text-ink-2">
                      {new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {d.n} {d.n === 1 ? "trade" : "trades"}
                    </span>
                    <span className={cn("num", d.net > 0 ? "text-pos" : "text-neg")}>{fmtMoney(d.net, { sign: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-4 font-mono text-[10px] text-ink-4">Columns: trades · win rate · profit factor · net P&amp;L (your real results, copies counted once).</p>
        </div>
      )}

      <div className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4">
          <span className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">A year, copied across funded accounts</span>
          <Seg value={String(risk)} options={[{ value: "actual", label: "My actual size", href: go({ risk: "actual" }) }, ...SCALE_RISKS.map((r) => ({ value: String(r), label: `$${r} risk`, href: go({ risk: r }) }))]} />
        </div>
        {!year ? (
          <p className="font-mono text-[11px] text-ink-3">Needs at least 10 measured trades to project.</p>
        ) : (
          <>
            {edge.n < 40 && (
              <p className="mb-3 border border-gold/50 px-3 py-2 font-mono text-[10.5px] leading-[1.7] text-gold">
                Only {edge.n} trades: far too few to trust. A handful of good trades makes every number below look huge. Treat it as a rough sketch until you have 40+, ideally 100.
              </p>
            )}
            <ul>
              <li className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-x-3 pb-1 font-mono text-[9px] tracking-[0.2em] text-ink-4 uppercase">
                <span>accounts</span>
                <span className="text-right">bad year (1 in 10)</span>
                <span className="text-right">typical year</span>
                <span className="text-right">good year (1 in 10)</span>
              </li>
              {SCALE_ACCOUNTS.map((a) => (
                <li key={a} className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-x-3 border-b border-line py-2 font-mono text-[12px]">
                  <span className="text-ink-2">{a}</span>
                  <span className={cn("num text-right", year.low10 < 0 ? "text-neg" : "text-ink-3")}>{fmtMoney(year.low10 * a, { sign: true })}</span>
                  <span className={cn("num text-right", year.median > 0 ? "text-pos" : year.median < 0 ? "text-neg" : "text-ink")}>{fmtMoney(year.median * a, { sign: true })}</span>
                  <span className="num text-right text-ink-3">{fmtMoney(year.high90 * a, { sign: true })}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-mono text-[10.5px] leading-[1.8] text-ink-3">
              {risk === "actual" ? "At the size you really traded" : `At $${risk} per 1R (your usual full loss), each trade's result is scaled to that size`}. Per account: about {year.avgPayouts.toFixed(1)} payouts a year · {pct(year.bustChance)} chance it busts at least once ({year.avgBusts.toFixed(1)} times on average) {risk === "actual" ? "at the size you really traded" : `at $${risk} a trade`}.
            </p>
            <p className="mt-2 font-mono text-[10px] leading-[1.8] text-ink-4">
              Your own trades, resampled 2,000 times over a year. $2,000 trailing max loss (stops at the start once $2,000 up); $2,000 payout (90% to you) every time it&apos;s $4,000 up; a bust costs a $150 replacement eval and 4 weeks off. Copied accounts take the same trades, so they win and lose together: N accounts = N × one. Most firms allow 5 funded accounts each, so 10+ means more than one firm (always the same direction, never opposite). It&apos;s a projection from your past trades, not a promise: it only holds if you keep trading the same way.
            </p>
          </>
        )}
      </div>
    </Section>
  );
}
