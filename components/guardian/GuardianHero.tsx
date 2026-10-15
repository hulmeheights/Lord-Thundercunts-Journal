import { PageHead, Meta, Cue, Dot, LinkBtn } from "@/components/m";
import { LimitLine } from "@/components/m/LimitLine";
import { Odometer } from "@/components/motion/Odometer";
import type { PropStatus } from "@/lib/analytics/prop";
import type { PropSettings } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { accountName, pct, shortDay } from "./words";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

type Mood = { tone: "pos" | "gold" | "mute"; text: string; pulse: boolean };

function mood(st: PropStatus): Mood {
  if (st.breached) return { tone: "mute", text: "Max loss crossed", pulse: false };
  if (st.cushionPct < 0.25) return { tone: "gold", text: "Thin cushion — size down", pulse: true };
  if (st.targetProgress !== null && st.targetProgress >= 1 && st.consistencyOk !== false) return { tone: "pos", text: "Target met", pulse: true };
  return { tone: "pos", text: "Protected", pulse: true };
}

/** Guardian's opening: the serif promise, the line itself, and today against it. */
export function GuardianHero({ prop, st }: { prop: PropSettings; st: PropStatus | null }) {
  if (!st) {
    return (
      <div id="top" className="scroll-mt-24">
        <PageHead eyebrow="Guardian · prop rules · not set" title={<>Never blow an evaluation <em>by accident</em>.</>} />
        <div className="reveal" style={d(260)}>
          <LimitLine closeness={0.55} label="YOUR LINE · NOT SET" height={110} />
        </div>
        <div className="mt-[clamp(2rem,5vh,3rem)] flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
          <p className="reveal max-w-[40ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2" style={d(320)}>
            Set it once. Cross it never. Guardian replays your account against your firm&apos;s rules — trailing max loss, daily limit,
            consistency — and builds four thousand futures from your own days to show your odds.
          </p>
        </div>
        <div className="reveal mt-[clamp(2.4rem,6vh,3.6rem)] flex flex-wrap items-center gap-x-8 gap-y-5" style={d(380)}>
          <LinkBtn href="#rules" variant="primary" size="lg">
            Set your line
          </LinkBtn>
          <Cue href="#ledger">↓ the eval ledger</Cue>
        </div>
      </div>
    );
  }

  const m = mood(st);
  const closeness = st.breached ? 1 : 1 - Math.max(0, Math.min(1, st.cushionPct));
  const usedToday = st.dailyLossUsed;

  return (
    <div id="top" className="scroll-mt-24">
      <PageHead
        eyebrow={
          <>
            Guardian · {accountName(prop)} · since {shortDay(prop.startDate)}
          </>
        }
        title={
          st.breached ? (
            <>
              The line was <em>crossed</em>.
            </>
          ) : (
            <>
              Every trader has a line. Yours is <em>{fmtMoney(st.cushion)}</em> away.
            </>
          )
        }
        meta={
          <Meta
            value={fmtMoney(st.balance)}
            caption={
              <>
                Balance · <span className={cn(st.profit > 0.004 && "text-pos", st.profit < -0.004 && "text-neg")}>{fmtMoney(st.profit, { sign: true })}</span>
              </>
            }
          />
        }
      />

      <div className="reveal" style={d(260)}>
        <LimitLine closeness={closeness} label={`MAX LOSS · ${fmtMoney(st.floor)}`} height={120} />
      </div>

      <div className="mt-[clamp(2rem,5vh,3rem)] flex flex-wrap items-end justify-between gap-x-10 gap-y-9">
        <p className="reveal max-w-[40ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2" style={d(320)}>
          {st.breached ? (
            <>The account closed below its max loss. Guardian keeps the record honest; reset the rules below when you start the next one.</>
          ) : (
            <>
              Set it once. Cross it never. The max loss trails your best close until it locks at {fmtMoney(prop.startBalance)} — Guardian
              replays every day against it, {pct(Math.min(1, st.cushionPct))}% of the cushion still standing.
            </>
          )}
        </p>
        <div className="reveal shrink-0 text-right font-mono max-sm:text-left" style={d(380)}>
          <Odometer value={st.todayPnl} className="text-[clamp(1.5rem,3vw,2.2rem)] font-light tracking-[0.01em]" delay={400} />
          <div className="mt-1.5 text-[9px] tracking-[0.3em] text-ink-4 uppercase">
            Today
            {prop.dailyLossLimit ? (
              <>
                {" "}
                · {usedToday ? `${pct(usedToday)}% of ` : ""}
                {fmtMoney(-prop.dailyLossLimit)} limit
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
        <Cue href="#odds">↓ the odds</Cue>
        <Cue href="#ledger">↓ the ledger</Cue>
        <Cue href="#rules">↓ the rules</Cue>
      </div>
    </div>
  );
}
