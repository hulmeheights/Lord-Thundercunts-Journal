import { Cue, Dot, LinkBtn, Meta } from "@/components/m";
import { LimitLine } from "@/components/m/LimitLine";
import { Odometer } from "@/components/motion/Odometer";
import type { PropStatus } from "@/lib/analytics/prop";
import type { PropSettings } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Head } from "./Head";
import { Money } from "./Figure";
import { accountName, pct, shortDay } from "./words";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;
const sub = "reveal max-w-[42ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2";

type Mood = { tone: "pos" | "gold" | "mute"; text: string; pulse: boolean };

function mood(st: PropStatus): Mood {
  if (st.breached) return { tone: "mute", text: "Max loss crossed", pulse: false };
  if (st.cushionPct < 0.25) return { tone: "gold", text: "Thin cushion — size down", pulse: true };
  if (st.targetProgress !== null && st.targetProgress >= 1 && st.consistencyOk !== false) return { tone: "pos", text: "Target met", pulse: true };
  return { tone: "pos", text: "Protected", pulse: true };
}

/** "GUARDIAN · TOPSTEP 50K COMBINE · SINCE AUG 10" — two short lines on a phone. */
function Eyebrow({ prop, on }: { prop: PropSettings; on: boolean }) {
  return (
    <>
      <span className="text-ink-3">Guardian</span>
      <span className="max-sm:hidden"> · </span>
      <span className="max-sm:mt-2.5 max-sm:block">{on ? accountName(prop) : "Prop rules · not set"}</span>
      {on && <span className="max-sm:hidden"> · since {shortDay(prop.startDate)}</span>}
    </>
  );
}

/** Guardian's opening: the serif promise, the line itself, and today against it. */
export function GuardianHero({ prop, st }: { prop: PropSettings; st: PropStatus | null }) {
  if (!st) {
    return (
      <div id="top" className="scroll-mt-24">
        <Head
          eyebrow={<Eyebrow prop={prop} on={false} />}
          title={
            <>
              Never blow an evaluation <em>by accident</em>.
            </>
          }
        />
        <div className="reveal" style={d(260)}>
          <LimitLine closeness={0.55} label="YOUR LINE · NOT SET" height={120} className="max-sm:!h-[96px]" />
        </div>
        <p className={cn(sub, "mt-[clamp(2rem,5vh,3rem)]")} style={d(320)}>
          <span className="text-ink">Set it once. Cross it never.</span> Tell Guardian your firm&apos;s rules and it replays every day against
          them — the trailing max loss, the daily limit, consistency — then builds four thousand futures from your own days to show your odds.
        </p>
        <div className="reveal mt-[clamp(2.4rem,6vh,3.6rem)] flex flex-wrap items-center gap-x-9 gap-y-6" style={d(380)}>
          <LinkBtn href="#rules" variant="primary" size="lg" className="max-sm:w-full">
            Set your line
          </LinkBtn>
          <Cue href="#ledger">↓ the eval ledger</Cue>
        </div>
      </div>
    );
  }

  const m = mood(st);
  const closeness = st.breached ? 1 : 1 - Math.max(0, Math.min(1, st.cushionPct));
  const used = st.dailyLossUsed;

  return (
    <div id="top" className="scroll-mt-24">
      <Head
        eyebrow={<Eyebrow prop={prop} on />}
        title={
          st.breached ? (
            <>
              The line was <em>crossed</em>.
            </>
          ) : (
            <>
              Every trader has a line.
              <br className="max-sm:hidden" /> Yours is <em className="whitespace-nowrap">{fmtMoney(st.cushion)}</em> away.
            </>
          )
        }
        meta={
          <Meta
            value={fmtMoney(st.balance)}
            caption={
              <>
                Balance ·{" "}
                <Money className={cn(st.profit > 0.004 && "text-pos", st.profit < -0.004 && "text-neg")}>{fmtMoney(st.profit, { sign: true })}</Money>
              </>
            }
          />
        }
      />

      <div className="reveal" style={d(260)}>
        <LimitLine closeness={closeness} label={`MAX LOSS · ${fmtMoney(st.floor)}`} height={124} className="max-sm:!h-[100px]" />
      </div>

      <div className="mt-[clamp(2rem,5vh,3rem)] flex flex-wrap items-end justify-between gap-x-10 gap-y-9">
        <p className={sub} style={d(320)}>
          {st.breached ? (
            <>
              <span className="text-ink">The account closed below its max loss.</span> Guardian keeps the record honest — log the reset in the
              ledger and start the next one in the rules below.
            </>
          ) : (
            <>
              <span className="text-ink">Set it once. Cross it never.</span> The max loss trails your best close until it locks at{" "}
              {fmtMoney(prop.startBalance)}. {pct(Math.min(1, st.cushionPct))}% of the cushion is still standing.
            </>
          )}
        </p>
        <div className="reveal shrink-0 text-right font-mono max-sm:text-left" style={d(380)}>
          <Odometer value={st.todayPnl} className="text-[clamp(1.6rem,3vw,2.3rem)] leading-none font-light tracking-[0.01em]" delay={400} />
          <div className="mt-2.5 text-[9px] tracking-[0.3em] text-ink-4 uppercase">
            Today
            {prop.dailyLossLimit ? (
              <>
                {" "}
                · {used ? `${pct(used)}% of ` : ""}
                <Money>{fmtMoney(-prop.dailyLossLimit)}</Money> limit
              </>
            ) : (
              " · no daily limit"
            )}
          </div>
        </div>
      </div>

      <div className="reveal mt-[clamp(2.6rem,6vh,3.8rem)] flex flex-wrap items-center gap-x-8 gap-y-5" style={d(440)}>
        <span
          className={cn(
            "inline-flex items-center gap-2.5 font-mono text-[10px] tracking-[0.3em] uppercase",
            m.tone === "pos" ? "text-pos" : m.tone === "gold" ? "text-gold" : "text-ink-2",
          )}
        >
          <Dot tone={m.tone} pulse={m.pulse} />
          {m.text}
        </span>
        <span className="hidden h-px w-10 bg-line-2 sm:block" aria-hidden />
        <span className="flex flex-wrap items-center gap-x-8 gap-y-3 max-sm:w-full max-sm:justify-between max-sm:gap-x-4">
          {!st.breached && <Cue href="#odds">↓ the odds</Cue>}
          <Cue href="#ledger">↓ the ledger</Cue>
          <Cue href="#rules">↓ the rules</Cue>
        </span>
      </div>
    </div>
  );
}
