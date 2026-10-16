import { Bars } from "@/components/m/Bars";
import { LineChart } from "@/components/m/LineChart";
import { Num, Panel, Section, Stats, Tag } from "@/components/m";
import { KIND_LABEL, groupByMonth, isInflow, signedAmount, type LedgerEntry, type LedgerSummary } from "@/lib/analytics/ledger";
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
  if (s.costPerPayout !== null && s.costPerPayout > 0) out.push(<>Each payout has cost {money(s.costPerPayout)} in fees to earn.</>);
  if (s.toBreakEven > 0) out.push(<>One payout of {money(s.toBreakEven)} squares the ledger.</>);
  else if (s.net > 0 && s.cost > 0) out.push(<>Every fee has been paid back, and {money(s.net)} more.</>);
  const best = [...s.byFirm].filter((f) => f.net > 0).sort((a, b) => b.net - a.net)[0];
  if (best && s.byFirm.length > 1) out.push(<>Best relationship: {best.firm}, {fmtMoney(best.net, { sign: true })}.</>);
  const dry = [...s.byFirm].filter((f) => f.payouts === 0 && f.cost > 0).sort((a, b) => b.cost - a.cost)[0];
  if (dry) out.push(<>{dry.firm} has cost {money(dry.cost)} without a payout yet.</>);
  if (s.resets > 0) out.push(<>{s.resets === 1 ? "One reset" : `${s.resets} resets`} — {money(s.byKind.reset.total)} on second chances.</>);
  return out.slice(0, 4);
}

/**
 * One entry, as an editorial row. Desktop: date · firm · kind + note · amount · ×
 * on fixed tracks so every row lines up. Phone: date and × on top, the firm and
 * the amount on one line, the kind and note beneath.
 */
function EntryRow({ e, d }: { e: LedgerEntry; d: number }) {
  const v = signedAmount(e);
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
        <Tag tone={isInflow(e.kind) ? "pos" : undefined} className="translate-y-[-1px]">
          {KIND_LABEL[e.kind]}
        </Tag>
        {e.note && <span className="min-w-0 font-mono text-[12px] leading-[1.8] tracking-[0.02em] text-ink-2">{e.note}</span>}
      </div>
      <div className="text-right whitespace-nowrap [grid-area:a]">
        <Num value={v} cents className="text-[clamp(14px,1.4vw,15.5px)] tracking-[-0.01em]" />
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
          What the evals have <em>cost</em> — and what they&apos;ve paid back.
        </>
      }
    >
      {s.count > 0 && (
        <>
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
              value={s.evals}
              label="Evaluations bought"
              sub={
                [s.resets && `${s.resets} reset${s.resets === 1 ? "" : "s"}`, s.activations && `${s.activations} activation${s.activations === 1 ? "" : "s"}`]
                  .filter(Boolean)
                  .join(" · ") || "no resets"
              }
              d={80}
            />
            <Figure
              size="lg"
              value={s.payouts}
              label="Payouts"
              sub={s.costPerPayout !== null ? `${money(s.costPerPayout)} of fees per payout` : "none yet"}
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
