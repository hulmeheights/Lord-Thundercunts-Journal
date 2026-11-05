import { Section, Stat, Stats } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import type { AccountYear, Edge } from "@/lib/analytics/scale";

export type ScaleFilterKey = "aplusw" | "aplus" | "window" | "all";
export const SCALE_FILTERS: { value: ScaleFilterKey; label: string }[] = [
  { value: "aplusw", label: "A+ in my window" },
  { value: "aplus", label: "A+ any time" },
  { value: "window", label: "All in my window" },
  { value: "all", label: "Everything" },
];
export const SCALE_RISKS = [100, 150, 200, 250, 300, 600];
export const SCALE_ACCOUNTS = [1, 5, 10, 15];

const r2 = (x: number | null) => (x === null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`);
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Guardian → Scale: is your own edge ready to copy across accounts, and what a year of it could look like. */
export function ScaleSection({ n, edge, year, filter, risk, windowLabel, days }: { n: number; edge: Edge; year: AccountYear | null; filter: ScaleFilterKey; risk: number | "actual"; windowLabel: string | null; days: number }) {
  const sd = days === 365 ? "365" : days > 365 ? "all" : "90";
  const href = (f: ScaleFilterKey, r: number | "actual", d = sd) => `/guardian?sf=${f}&sr=${r}&sd=${d}#scale`;
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
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
        <Seg value={filter} options={SCALE_FILTERS.map((o) => ({ ...o, href: href(o.value, risk) }))} />
        <Seg
          value={sd}
          options={[
            { value: "90", label: "90 days", href: href(filter, risk, "90") },
            { value: "365", label: "1 year", href: href(filter, risk, "365") },
            { value: "all", label: "All", href: href(filter, risk, "all") },
          ]}
        />
      </div>
      <p className="mt-3 max-w-2xl font-mono text-[10.5px] leading-[1.8] text-ink-4">
        Your own trades {sd === "all" ? "from the last 3 years" : sd === "365" ? "from the last year" : "from the last 90 days"}{filter === "aplusw" || filter === "window" ? ` inside ${windowLabel ?? "your trading window (set it in Settings → Trading rules)"}` : ""}
        {filter === "aplusw" || filter === "aplus" ? ", graded A+" : ""}, measured in R (each account&apos;s own 1R). Grade every trade so this stays honest.
      </p>
      <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink-3">
        How the count is made: {edge.funnel.period} trades in this period
        {edge.funnel.inWindow !== null && <> · {edge.funnel.inWindow} entered inside your window</>} · {edge.funnel.gradedAny} graded at all · {edge.funnel.aplusAnyTime} graded A+
        {edge.funnel.aplusOutsideWindow ? <> ({edge.funnel.aplusOutsideWindow} of them outside your window, left out)</> : null} · {edge.funnel.matching} match this view
        {edge.copiesFolded ? <> · {edge.copiesFolded} were copies on other accounts, counted once</> : null}
        {edge.noRisk ? <> · {edge.noRisk} left out with no 1R to measure</> : null} → <span className="text-ink">{edge.n} measured</span>.
      </p>
      {edge.n === 0 && (filter === "aplusw" || filter === "aplus") && (
        <p className="mt-2 font-mono text-[10.5px] text-gold">No trades graded A+ here yet. Grade your trades (Trades → each trade), or switch to &quot;All in my window&quot; to see your edge so far.</p>
      )}

      <Stats cols={4} className="mt-8">
        <Stat value={`${edge.n}`} label="Trades measured" sub={edge.tradesPerDay ? `${edge.tradesPerDay.toFixed(1)} a day · ${edge.daysPerMonth} days a month${edge.copiesFolded ? ` · ${edge.copiesFolded} copies folded in` : ""}` : "none yet"} />
        <Stat value={pct(edge.winRate)} label="Win rate" sub={edge.avgWinUsd !== null ? `avg win ${fmtMoney(edge.avgWinUsd)} · loss ${fmtMoney(edge.avgLossUsd ?? 0)} (${r2(edge.avgWinR)} / ${r2(edge.avgLossR)})` : undefined} />
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

      <div className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4">
          <span className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">A year, copied across funded accounts</span>
          <Seg value={String(risk)} options={[{ value: "actual", label: "My actual size", href: href(filter, "actual") }, ...SCALE_RISKS.map((r) => ({ value: String(r), label: `$${r} risk`, href: href(filter, r) }))]} />
        </div>
        {!year ? (
          <p className="font-mono text-[11px] text-ink-3">Needs at least 10 measured trades to project.</p>
        ) : (
          <>
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
              Per account: about {year.avgPayouts.toFixed(1)} payouts a year · {pct(year.bustChance)} chance it busts at least once ({year.avgBusts.toFixed(1)} times on average) {risk === "actual" ? "at the size you really traded" : `at $${risk} a trade`}.
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
