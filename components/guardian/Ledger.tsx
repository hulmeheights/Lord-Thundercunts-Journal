import { Bars } from "@/components/m/Bars";
import { LineChart } from "@/components/m/LineChart";
import { Num, Panel, Section, Stats, Tag } from "@/components/m";
import { KIND_LABEL, groupByMonth, isInflow, isOutcome, qtyOf, signedAmount, type LedgerEntry, type LedgerSummary } from "@/lib/analytics/ledger";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Figure, Money } from "./Figure";
import { LedgerComposer } from "./LedgerComposer";
import { LedgerDelete } from "./LedgerDelete";
import { LedgerFold } from "./LedgerFold";
import { monthLabel, shortDay } from "./words";

const tone = (n: number) => (n > 0.004 ? "pos" : n < -0.004 ? "neg" : null);
/** Whole dollars when the amount is whole; cents when they matter. */
const money = (n: number) => fmtMoney(n, { cents: Math.abs(n) < 1000 && Math.round(n) !== n });
/** Show this many recent entries (whole months) before folding the rest. */
const RECENT = 6;
const pct = (r: number) => `${Math.round(r * 100)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The serif verdict for the gold panel: what the evals have cost and paid. */
function verdict(s: LedgerSummary): React.ReactNode {
  const solo = s.byFirm.length === 1 ? s.byFirm[0]!.firm : null;
  const who = solo ?? "The evals";
  const has = solo ? "has" : "have";
  const hasnt = solo ? "hasn't" : "haven't";
  const net = (
    <em className={cn("whitespace-nowrap", s.net > 0.004 && "text-pos")}>
      {fmtMoney(s.net, { sign: true })}
    </em>
  );
  if (s.paidOut === 0)
    return (
      <>
        {who} {has} cost you <Money>{money(s.cost)}</Money> — and {hasnt} paid out <em>yet</em>.
      </>
    );
  if (s.cost <= 0)
    return (
      <>
        {who} {has} paid you <Money>{money(s.paidOut)}</Money> for <em>nothing</em> down.
      </>
    );
  return (
    <>
      {who} {has} cost you <Money>{money(s.cost)}</Money> and paid you <Money>{money(s.paidOut)}</Money> — {net} net.
    </>
  );
}

function insights(s: LedgerSummary): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  if (s.passRate !== null) out.push(<>{plural(s.passed, "eval")} passed of {(s.passed + s.blown).toLocaleString("en-US")} decided — a {pct(s.passRate)}% pass rate.</>);
  if (s.costPerFunded !== null && s.costPerFunded > 0) out.push(<>Each funded account has cost {money(s.costPerFunded)} in fees.</>);
  if (s.costPerPayout !== null && s.costPerPayout > 0) out.push(<>Each payout has cost {money(s.costPerPayout)} in fees to earn.</>);
  if (s.toBreakEven > 0) out.push(<>One payout of {money(s.toBreakEven)} squares the ledger.</>);
  else if (s.net > 0 && s.cost > 0) out.push(<>Every fee has been paid back, and {money(s.net)} more.</>);
  const best = [...s.byFirm].filter((f) => f.net > 0).sort((a, b) => b.net - a.net)[0];
  if (best && s.byFirm.length > 1) out.push(<>Best relationship: {best.firm}, {fmtMoney(best.net, { sign: true })}.</>);
  const dry = [...s.byFirm].filter((f) => f.payouts === 0 && f.cost > 0).sort((a, b) => b.cost - a.cost)[0];
  if (dry) out.push(<>{dry.firm} has cost {money(dry.cost)} without a payout yet.</>);
  if (s.resets > 0) out.push(<>{s.resets === 1 ? "One reset" : `${s.resets} resets`} — {money(s.byKind.reset.total)} on second chances.</>);
  return out.slice(0, 5);
}

/**
 * One entry, as an editorial row. Desktop: date · firm · kind + note · amount · ×
 * on fixed tracks so every row lines up. Phone: date and × on top, the firm and
 * the amount on one line, the kind and note beneath.
 */
function EntryRow({ e, d }: { e: LedgerEntry; d: number }) {
  const v = signedAmount(e);
  const q = qtyOf(e);
  const result = isOutcome(e.kind);
  return (
    <div
      className={cn(
        "reveal m-row grid items-baseline gap-x-[clamp(1rem,3vw,2.5rem)] border-t border-line py-[clamp(1.15rem,2.8vh,1.8rem)] transition-opacity duration-500",
        "grid-cols-[minmax(0,1fr)_auto] gap-y-2 [grid-template-areas:'d_x'_'f_a'_'n_n']",
        "md:grid-cols-[4.4rem_minmax(0,1fr)_minmax(0,1.3fr)_7.5rem_1.75rem] md:gap-y-0 md:[grid-template-areas:'d_f_n_a_x']",
        "has-[[data-pending=true]]:opacity-30",
      )}
      style={{ "--d": `${d}ms` } as React.CSSProperties}
    >
      <div className="font-mono text-[10.5px] tracking-[0.14em] text-gold uppercase [grid-area:d]">{shortDay(e.day)}</div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 [grid-area:f] md:block">
        <div className="truncate font-serif text-[clamp(1.25rem,2.1vw,1.55rem)] leading-[1.25] font-normal tracking-[-0.01em]">{e.firm}</div>
        {e.account && <div className="min-w-0 truncate font-mono text-[9.5px] tracking-[0.2em] text-ink-4 uppercase md:mt-1">{e.account}</div>}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-1.5 [grid-area:n] max-md:mt-1">
        <Tag tone={isInflow(e.kind) || e.kind === "passed" ? "pos" : result ? "neg" : undefined} className="translate-y-[-1px]">
          {KIND_LABEL[e.kind]}
          {q > 1 && !result && <span className="ml-1.5 text-ink-3">× {q}</span>}
        </Tag>
        {e.note && <span className="min-w-0 font-mono text-[12px] leading-[1.8] tracking-[0.02em] text-ink-2">{e.note}</span>}
      </div>
      <div className="text-right whitespace-nowrap [grid-area:a]">
        {result ? (
          <span className={cn("num text-[clamp(14px,1.4vw,15.5px)] tracking-[-0.01em]", e.kind === "passed" ? "text-pos" : "text-neg")}>
            {e.kind === "passed" ? "+" : "−"}
            {q} {q === 1 ? "acct" : "accts"}
          </span>
        ) : (
          <Num value={v} cents className="text-[clamp(14px,1.4vw,15.5px)] tracking-[-0.01em]" />
        )}
      </div>
      <div className="relative -my-1 justify-self-end [grid-area:x]">
        <LedgerDelete id={e.id} label={`${KIND_LABEL[e.kind]} · ${e.firm} · ${shortDay(e.day)}`} />
      </div>
    </div>
  );
}

function Month({ month, net, entries, first }: { month: string; net: number; entries: LedgerEntry[]; first: boolean }) {
  return (
    <div className={first ? "mt-[clamp(2.4rem,6vh,3.4rem)]" : "mt-[clamp(2.8rem,7vh,4.2rem)]"}>
      <div className="reveal flex items-baseline justify-between gap-4 pb-3.5">
        <span className="font-mono text-[10px] tracking-[0.3em] text-ink-3 uppercase">{monthLabel(month, true)}</span>
        <Num value={net} cents className="text-[11px]" />
      </div>
      <div className="[&>*:last-child]:border-b [&>*:last-child]:border-line">
        {entries.map((e, i) => (
          <EntryRow key={e.id} e={e} d={Math.min(i, 6) * 50} />
        ))}
      </div>
    </div>
  );
}

/** Per firm: bought, passed, blown, pass rate, funded lost, payouts. */
function FirmScores({ firms }: { firms: LedgerSummary["byFirm"] }) {
  const rows = firms.filter((f) => f.evals + f.passed + f.blown + f.fundedBlown + f.payouts > 0);
  const cols = "grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))] sm:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,0.8fr))] items-baseline gap-x-4";
  const head = "font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase";
  return (
    <div className="reveal mt-[clamp(3rem,7vh,4.5rem)]">
      <div className={cn(cols, "border-b border-line pb-3")}>
        <span className={head}>By firm</span>
        <span className={cn(head, "text-right")}>Bought</span>
        <span className={cn(head, "text-right")}>Passed</span>
        <span className={cn(head, "text-right")}>Pass %</span>
        <span className={cn(head, "text-right max-sm:hidden")}>Blown</span>
        <span className={cn(head, "text-right max-sm:hidden")}>Funded lost</span>
        <span className={cn(head, "text-right max-sm:hidden")}>Payouts</span>
      </div>
      {rows.map((f) => (
        <div key={f.firm} className={cn(cols, "border-b border-line py-4")}>
          <span className="truncate font-serif text-[clamp(1.1rem,1.8vw,1.35rem)] font-light">{f.firm}</span>
          <span className="num text-right text-[13px] text-ink-2">{f.evals}</span>
          <span className="num text-right text-[13px] text-pos">{f.passed}</span>
          <span className="num text-right text-[13px] text-ink">{f.passRate === null ? "—" : `${pct(f.passRate)}%`}</span>
          <span className="num text-right text-[13px] text-neg max-sm:hidden">{f.blown}</span>
          <span className="num text-right text-[13px] text-neg max-sm:hidden">{f.fundedBlown}</span>
          <span className="num text-right text-[13px] text-ink-2 max-sm:hidden">
            {f.payouts}
            {f.paidOut > 0 && <span className="ml-1.5 text-ink-4">{money(f.paidOut)}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 03 — The ledger: what the evals have cost, what they've paid, and every entry. */
export function LedgerSection({
  entries,
  summary,
  n,
  today,
  firms,
}: {
  entries: LedgerEntry[];
  summary: LedgerSummary;
  n: number;
  today: string;
  firms: string[];
}) {
  const s = summary;
  const groups = groupByMonth(entries);
  const accounts = [...new Set(entries.map((e) => e.account).filter((a): a is string => !!a))].slice(0, 30);
  const curve = [0, ...s.byMonth.map((m) => m.cumNet)];
  const curveLabels = ["Start", ...s.byMonth.map((m) => monthLabel(m.month))];
  const notes = insights(s);

  // Whole months until at least RECENT entries are showing; the rest fold away.
  let shown = 0;
  let cut = groups.length;
  for (let i = 0; i < groups.length; i++) {
    shown += groups[i]!.entries.length;
    if (shown >= RECENT) {
      cut = i + 1;
      break;
    }
  }
  // Folding a single straggler month saves nothing.
  if (groups.length - cut === 1 && groups[cut]!.entries.length <= 2) cut = groups.length;
  const recent = groups.slice(0, cut);
  const earlier = groups.slice(cut);
  const earlierCount = earlier.reduce((t, g) => t + g.entries.length, 0);

  return (
    <Section
      id="ledger"
      n={n}
      label="The ledger"
      aside={s.count ? <span className="eyebrow max-sm:hidden">since {monthLabel(s.firstDay!.slice(0, 7), true)}</span> : null}
      lead={
        <>
          Passed, blown, <em>paid</em> — and what it all cost.
        </>
      }
    >
      {s.count > 0 && (
        <>
          {(s.evals > 0 || s.passed + s.blown + s.fundedBlown > 0) && (
            <div className="mb-[clamp(4rem,10vh,7rem)]">
              <div className="reveal mb-6 flex items-baseline justify-between gap-4">
                <span className="eyebrow">The scoreboard · accounts</span>
                {s.inEval > 0 && <span className="eyebrow">{plural(s.inEval, "eval")} still running</span>}
              </div>
              <Stats cols={3}>
                <Figure size="lg" value={s.evals.toLocaleString("en-US")} label="Evals bought" sub={s.resets ? plural(s.resets, "reset") : "no resets"} />
                <Figure
                  size="lg"
                  value={s.passed.toLocaleString("en-US")}
                  tone={s.passed > 0 ? "pos" : null}
                  label="Passed"
                  sub={s.passRate !== null ? `${pct(s.passRate)}% pass rate` : "mark one when it passes"}
                  d={80}
                />
                <Figure size="lg" value={s.blown.toLocaleString("en-US")} label="Blown evals" sub={s.passRate !== null ? `${pct(1 - s.passRate)}% of decided evals` : "none marked"} d={160} />
                <Figure
                  size="lg"
                  value={s.liveFunded.toLocaleString("en-US")}
                  tone={s.liveFunded > 0 ? "pos" : null}
                  label="Funded · still live"
                  sub={`${plural(s.fundedBlown, "funded account")} blown`}
                />
                <Figure
                  size="lg"
                  value={s.payouts.toLocaleString("en-US")}
                  label="Payouts"
                  sub={s.avgPayout !== null ? `${money(s.avgPayout)} on average` : "none yet"}
                  d={80}
                />
                <Figure
                  size="lg"
                  value={s.paidPerFunded !== null ? money(s.paidPerFunded) : "—"}
                  tone={s.paidPerFunded ? "pos" : null}
                  label="Paid per funded account"
                  sub={s.payoutsPerFunded !== null ? `${s.payoutsPerFunded.toFixed(1)} payouts each` : "once an eval passes"}
                  d={160}
                />
              </Stats>
              {s.byFirm.some((f) => f.evals + f.passed + f.blown > 0) && <FirmScores firms={s.byFirm} />}
            </div>
          )}
          <Stats cols={3}>
            <Figure
              size="lg"
              value={money(s.cost)}
              label="Spent on evals & fees"
              sub={s.refunds ? `${money(s.spent)} paid · ${money(s.refunds)} refunded` : `${s.count} ${s.count === 1 ? "entry" : "entries"} logged`}
            />
            <Figure
              size="lg"
              value={money(s.paidOut)}
              tone={s.paidOut > 0 ? "pos" : null}
              label="Paid out"
              sub={s.payouts ? `${s.payouts} ${s.payouts === 1 ? "payout" : "payouts"} received` : "the first one changes everything"}
              d={80}
            />
            <Figure
              size="lg"
              value={fmtMoney(s.net, { sign: true })}
              tone={tone(s.net)}
              label="Net"
              sub={s.net < -0.004 ? `${money(s.toBreakEven)} to square it` : "in your pocket"}
              d={160}
            />
            <Figure
              size="lg"
              value={s.roi === null ? "—" : `${s.roi > 0.0049 ? "+" : s.roi < -0.0049 ? "−" : ""}${Math.abs(Math.round(s.roi * 100)).toLocaleString("en-US")}`}
              unit={s.roi === null ? undefined : "%"}
              tone={s.roi === null ? null : tone(s.roi)}
              label="Return on fees"
              sub="net ÷ cost"
            />
            <Figure
              size="lg"
              value={s.costPerFunded !== null ? money(s.costPerFunded) : "—"}
              label="Fees per funded account"
              sub={
                [s.resets && `${s.resets} reset${s.resets === 1 ? "" : "s"}`, s.activations && `${s.activations} activation${s.activations === 1 ? "" : "s"}`]
                  .filter(Boolean)
                  .join(" · ") || "cost ÷ evals passed"
              }
              d={80}
            />
            <Figure
              size="lg"
              value={s.costPerPayout !== null ? money(s.costPerPayout) : "—"}
              label="Fees per payout"
              sub={s.payouts ? `over ${plural(s.payouts, "payout")}` : "none yet"}
              d={160}
            />
          </Stats>

          <div className="mt-[clamp(4.5rem,11vh,8rem)] grid items-start gap-[clamp(3.5rem,7vw,6rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <Panel gold>
              <div className="font-mono text-[9.5px] tracking-[0.34em] text-gold uppercase">◆ The sum</div>
              <p className="mt-6 font-serif text-[clamp(1.45rem,2.6vw,2.05rem)] leading-[1.3] font-light tracking-[-0.01em] [&_em]:italic">{verdict(s)}</p>
              {notes.length > 0 && (
                <ul className="mt-8 flex flex-col gap-3.5 border-t border-line pt-7">
                  {notes.map((t, i) => (
                    <li key={i} className="relative pl-[1.5em] font-mono text-[12px] leading-[1.75] tracking-[0.01em] text-ink">
                      <span className="absolute top-[0.32em] left-0 text-[0.7em] text-gold" aria-hidden>
                        ◆
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="min-w-0">
              <div className="reveal mb-5 flex items-baseline justify-between gap-4">
                <span className="eyebrow">By firm · net</span>
                <span className="eyebrow hidden sm:inline">cost / paid</span>
              </div>
              <Bars
                data={s.byFirm.map((f) => ({
                  label: f.firm,
                  value: f.net,
                  sub: `${fmtMoney(-f.cost, { cents: false })} / ${fmtMoney(f.paidOut, { sign: true, cents: false })}`,
                }))}
              />

              {s.byMonth.length > 1 && (
                <>
                  <div className="reveal mt-[clamp(3rem,7vh,4.5rem)] mb-5 flex items-baseline justify-between gap-4">
                    <span className="eyebrow">Running net · by month</span>
                    <Num value={s.net} className="text-[12px]" />
                  </div>
                  <div className="reveal">
                    <LineChart series={[{ values: curve, tone: s.net >= 0 ? "pos" : "ink" }]} labels={curveLabels} height={190} />
                  </div>
                  <div className="mt-3 flex justify-between font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase">
                    <span>{monthLabel(s.byMonth[0]!.month)}</span>
                    <span>{monthLabel(s.byMonth[s.byMonth.length - 1]!.month)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <div id="ledger-entries" className={cn("scroll-mt-24", s.count > 0 && "mt-[clamp(4.5rem,11vh,8rem)]")}>
        <LedgerComposer count={s.count} today={today} firms={firms} accounts={accounts} />

        {recent.map((g, i) => (
          <Month key={g.month} month={g.month} net={g.net} entries={g.entries} first={i === 0} />
        ))}
        {earlier.length > 0 && (
          <LedgerFold count={earlierCount} months={earlier.length}>
            {earlier.map((g) => (
              <Month key={g.month} month={g.month} net={g.net} entries={g.entries} first={false} />
            ))}
          </LedgerFold>
        )}
      </div>
    </Section>
  );
}
