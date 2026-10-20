import { Panel, Section, Stats } from "@/components/m";
import type { Road, Spread } from "@/lib/analytics/road";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Figure } from "./Figure";

const days = (n: number | null) => (n === null ? "—" : `${Math.round(n)}`);
const dayWord = (n: number) => (Math.round(n) === 1 ? "day" : "days");
/** "usually 9–17 days · 6 measured" */
function usual(s: Spread, what: string): string {
  if (!s.n) return `log a few ${what} to see it`;
  const range = s.low !== null && s.high !== null && Math.round(s.low) !== Math.round(s.high) ? `usually ${Math.round(s.low)}–${Math.round(s.high)} days · ` : "";
  return `${range}${s.n} measured`;
}

function verdict(r: Road): React.ReactNode {
  const whole = r.daysEvalToPayout.median;
  if (whole !== null)
    return (
      <>
        From buying an eval to the first payout on it takes you about <em>{Math.round(whole)} {dayWord(whole)}</em>
        {r.attemptsPerPass !== null && r.attemptsPerPass > 1.05 && (
          <>
            {" "}
            — and about <em>{r.attemptsPerPass.toFixed(1)} goes</em> to land each funded account
          </>
        )}
        .
      </>
    );
  if (r.daysToPass.median !== null)
    return (
      <>
        An eval takes you about <em>{Math.round(r.daysToPass.median)} {dayWord(r.daysToPass.median)}</em> to pass. Log your first payout to see the
        rest of the road.
      </>
    );
  return (
    <>
      Mark evals <em>passed</em> or <em>blown</em> in the ledger and the road to paid draws itself.
    </>
  );
}

/** The road to paid: time to pass, goes per pass, time to the first payout and between payouts. */
export function RoadSection({ road: r, n }: { road: Road; n: number }) {
  const any = r.daysToPass.n + r.daysToBlow.n + r.daysPassToPayout.n > 0 || r.attemptsPerPass !== null;
  return (
    <Section
      id="road"
      n={n}
      label="The road to paid"
      lead={
        <>
          What it <em>takes</em> to get paid.
        </>
      }
    >
      <Panel gold>
        <div className="font-mono text-[9.5px] tracking-[0.34em] text-gold uppercase">◆ Your road, so far</div>
        <p className="mt-6 max-w-[34ch] font-serif text-[clamp(1.45rem,2.8vw,2.2rem)] leading-[1.3] font-light tracking-[-0.01em] [&_em]:italic">{verdict(r)}</p>
      </Panel>

      {any && (
        <div className="mt-[clamp(3.5rem,8vh,5.5rem)]">
          <Stats cols={3}>
            <Figure
              size="lg"
              value={r.attemptsPerPass === null ? "—" : r.attemptsPerPass.toFixed(1)}
              unit={r.attemptsPerPass === null ? undefined : "goes"}
              label="Evals per funded account"
              sub={r.attemptsPerPass === null ? "once one passes" : "passed + blown ÷ passed"}
            />
            <Figure size="lg" value={days(r.daysToPass.median)} unit={r.daysToPass.median === null ? undefined : "days"} label="To pass an eval" sub={usual(r.daysToPass, "passes")} d={80} />
            <Figure
              size="lg"
              value={days(r.daysToBlow.median)}
              unit={r.daysToBlow.median === null ? undefined : "days"}
              label="An eval lasts, when it's blown"
              sub={usual(r.daysToBlow, "blown evals")}
              d={160}
            />
            <Figure
              size="lg"
              value={days(r.daysPassToPayout.median)}
              unit={r.daysPassToPayout.median === null ? undefined : "days"}
              tone={r.daysPassToPayout.median !== null ? "pos" : null}
              label="Passed → first payout"
              sub={usual(r.daysPassToPayout, "payouts")}
            />
            <Figure
              size="lg"
              value={days(r.daysEvalToPayout.median)}
              unit={r.daysEvalToPayout.median === null ? undefined : "days"}
              label="Eval bought → first payout"
              sub={usual(r.daysEvalToPayout, "payouts")}
              d={80}
            />
            <Figure
              size="lg"
              value={days(r.daysBetweenPayouts.median)}
              unit={r.daysBetweenPayouts.median === null ? undefined : "days"}
              label="Between payouts"
              sub={usual(r.daysBetweenPayouts, "repeat payouts")}
              d={160}
            />
            <Figure
              size="lg"
              value={r.fundedPaidRate === null ? "—" : `${Math.round(r.fundedPaidRate * 100)}`}
              unit={r.fundedPaidRate === null ? undefined : "%"}
              label="Funded accounts paid"
              sub={r.fundedTotal ? `${r.fundedPaid} of ${r.fundedTotal} paid at least once` : "none funded yet"}
            />
            <Figure
              size="lg"
              value={r.feesPerPaidAccount === null ? "—" : fmtMoney(r.feesPerPaidAccount, { cents: false })}
              label="Fees per paid account"
              sub="every fee ÷ accounts that paid"
              d={80}
            />
            <Figure
              size="lg"
              value={days(r.fundedLifeDays.median)}
              unit={r.fundedLifeDays.median === null ? undefined : "days"}
              label="A lost funded account lasted"
              sub={usual(r.fundedLifeDays, "lost funded accounts")}
              d={160}
            />
          </Stats>

          {r.byFirm.length > 0 && <FirmRoads road={r} />}
        </div>
      )}

      <p className="reveal mt-[clamp(2.5rem,6vh,4rem)] max-w-[70ch] font-mono text-[11px] leading-[1.9] text-ink-4">
        Worked out from the ledger, firm by firm, oldest first: a passed or blown line closes your oldest open eval at that firm, and a payout goes
        to your oldest funded account there that hasn&apos;t been paid yet. Log results on the day they happen and the numbers are exact.
      </p>
    </Section>
  );
}

function FirmRoads({ road }: { road: Road }) {
  const cols = "grid grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.8fr))] sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.9fr))] items-baseline gap-x-4";
  const head = "font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase";
  const cell = "num text-right text-[13px] text-ink-2";
  return (
    <div className="reveal mt-[clamp(3rem,7vh,4.5rem)]">
      <div className={cn(cols, "border-b border-line pb-3")}>
        <span className={head}>By firm · typical</span>
        <span className={cn(head, "text-right")}>Goes</span>
        <span className={cn(head, "text-right")}>To pass</span>
        <span className={cn(head, "text-right")}>To payout</span>
        <span className={cn(head, "text-right max-sm:hidden")}>Eval → paid</span>
      </div>
      {road.byFirm.map((f) => (
        <div key={f.firm} className={cn(cols, "border-b border-line py-4")}>
          <span className="truncate font-serif text-[clamp(1.1rem,1.8vw,1.35rem)] font-light">{f.firm}</span>
          <span className={cell}>{f.attemptsPerPass === null ? "—" : f.attemptsPerPass.toFixed(1)}</span>
          <span className={cell}>{f.daysToPass.median === null ? "—" : `${Math.round(f.daysToPass.median)}d`}</span>
          <span className={cn(cell, f.daysPassToPayout.median !== null && "text-pos")}>{f.daysPassToPayout.median === null ? "—" : `${Math.round(f.daysPassToPayout.median)}d`}</span>
          <span className={cn(cell, "max-sm:hidden")}>{f.daysEvalToPayout.median === null ? "—" : `${Math.round(f.daysEvalToPayout.median)}d`}</span>
        </div>
      ))}
    </div>
  );
}
