import { tallyChecks, type OrderCheck, type OrderVerdict } from "@/lib/analytics/observer";
import type { PinnedOrder } from "@/lib/data/observer";
import { shortDate, WEEKDAYS, weekdayIndex } from "@/lib/analytics/time";
import { plural } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Rise } from "./Rise";
import { UnpinButton } from "./Tell";
import { IfThen, SessionMark } from "./ui";

const VERDICT: Record<OrderVerdict, { word: string; tone: string }> = {
  kept: { word: "Kept", tone: "text-pos" },
  broken: { word: "Broken", tone: "text-neg" },
  untested: { word: "Not tested yet", tone: "text-ink-3" },
  self: { word: "Yours to judge", tone: "text-ink-2" },
};

const SAY: Record<OrderVerdict, string> = {
  kept: "kept",
  broken: "broken",
  untested: "not tested",
  self: "yours to judge",
};

function Strip({ sessions, today }: { sessions: OrderCheck[]; today: string }) {
  return (
    <ol className="grid max-w-[22rem] grid-cols-7" aria-label="The last seven sessions">
      {sessions.map((c) => {
        const isToday = c.day === today;
        return (
          <li key={c.day} className="flex flex-col items-center gap-3.5" title={`${shortDate(c.day)} — ${c.reason}`}>
            <span className="grid h-3 place-items-center">
              <SessionMark verdict={c.verdict} />
            </span>
            <span className={cn("font-mono text-[9.5px] tracking-[0.12em]", isToday ? "text-gold" : "text-ink-4")}>
              {WEEKDAYS[weekdayIndex(c.day)]!.charAt(0)}
            </span>
            <span className="sr-only">
              {shortDate(c.day)}: {SAY[c.verdict]}. {c.reason}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The one pinned order: the if-then sentence, today's automatic verdict, and the
 * last seven sessions as a strip of marks. The single gold panel on the page.
 */
export function OrderPanel({ order, today }: { order: PinnedOrder; today: string }) {
  const t = order.today;
  const v = VERDICT[t.verdict];
  const tally = tallyChecks(order.sessions);
  const selfOnly = order.sessions.every((c) => c.verdict === "self");
  const untested = order.sessions.length - tally.tested;

  return (
    // The kit's gold Panel, risen through state: it can sit above the fold on a tall screen.
    <Rise className="rounded-[3px] border border-gold bg-gold/[0.03] p-[clamp(1.6rem,3vw,2.6rem)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="font-mono text-[9.5px] tracking-[0.3em] text-gold uppercase">
          <span aria-hidden className="mr-2.5">◆</span>Today&apos;s order
        </div>
        {order.pinnedAt && <div className="font-mono text-[9px] tracking-[0.26em] text-ink-4 uppercase">Pinned {shortDate(order.pinnedAt)}</div>}
      </div>

      <p className="mt-[clamp(1.4rem,3.5vh,2rem)] max-w-[30ch] font-serif text-[clamp(1.45rem,3vw,2.3rem)] leading-[1.28] font-light tracking-[-0.01em] [&_em]:italic">
        <IfThen when={order.when} then={order.then} />
      </p>

      <div className="mt-[clamp(1.8rem,4.5vh,2.6rem)] grid grid-cols-1 gap-x-[clamp(1.5rem,5vw,4rem)] gap-y-10 border-t border-line pt-[clamp(1.6rem,4vh,2.2rem)] md:grid-cols-2">
        <div>
          <div className="eyebrow !text-[9.5px]">Today · {shortDate(today)}</div>
          <div className={cn("mt-4 font-mono text-[clamp(1.5rem,3.2vw,2.2rem)] leading-none font-light tracking-[0.14em] uppercase", v.tone)}>
            {v.word}
            {t.verdict === "kept" && (
              <span aria-hidden className="ml-3 align-middle text-[0.42em] text-gold">
                ◆
              </span>
            )}
          </div>
          <p className="mt-4 max-w-[40ch] font-mono text-[11.5px] leading-[1.9] tracking-[0.03em] text-ink-2">{t.reason}</p>
        </div>

        <div>
          <div className="eyebrow mb-5 !text-[9.5px]">The last seven sessions</div>
          <Strip sessions={order.sessions} today={today} />
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[9px] tracking-[0.2em] text-ink-4 uppercase" aria-hidden>
            <span className="inline-flex items-center gap-2">
              <SessionMark verdict="kept" /> Kept
            </span>
            <span className="inline-flex items-center gap-2">
              <SessionMark verdict="broken" /> Broken
            </span>
            <span className="inline-flex items-center gap-2">
              <SessionMark verdict="untested" /> Not tested
            </span>
          </div>
          <p className="mt-4 font-mono text-[10.5px] leading-[1.8] tracking-[0.04em] text-ink-3">
            {selfOnly
              ? "The trades can't see this one. Only you can judge it."
              : tally.tested
                ? `${tally.kept} of ${plural(tally.tested, "tested session")} kept${untested ? ` · ${untested} not tested` : ""}.`
                : "Nothing has tested it yet. That's coming."}
          </p>
        </div>
      </div>

      <div className="mt-[clamp(1.8rem,4.5vh,2.6rem)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-5">
        <p className="font-mono text-[10px] leading-[1.8] tracking-[0.06em] text-ink-4">Checked from the trades themselves — no self-reporting, no arguing.</p>
        <UnpinButton />
      </div>
    </Rise>
  );
}
