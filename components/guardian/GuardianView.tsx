import { Section, Stats, Empty, Quote } from "@/components/m";
import { FanChart } from "@/components/charts/FanChart";
import type { MonteCarloResult, PropStatus } from "@/lib/analytics/prop";
import type { PropSettings } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { Figure, Money } from "./Figure";
import { Meter } from "./Meter";
import { countWord, pct, shortDay } from "./words";

const tone = (n: number) => (n > 0.004 ? "pos" : n < -0.004 ? "neg" : null);
const foot = "reveal mt-[clamp(3rem,7vh,4.5rem)] max-w-[52ch] font-mono text-[12px] leading-[1.9] tracking-[0.02em] text-ink-2";

function statusLead(st: PropStatus, survivable: number | null): React.ReactNode {
  if (st.breached)
    return (
      <>
        The max loss was crossed. <em>Reset</em> before the next trade.
      </>
    );
  if (st.tradingDays === 0)
    return (
      <>
        No trades on this account yet. The cushion is <em>whole</em>.
      </>
    );
  if (st.cushionPct < 0.25)
    return (
      <>
        The cushion is thin. <em>Size down</em> until it isn&apos;t.
      </>
    );
  if (st.targetProgress !== null && st.targetProgress >= 1)
    return st.consistencyOk === false ? (
      <>
        Target reached — but one day is <em>carrying</em> it.
      </>
    ) : (
      <>
        Target reached. Now <em>protect</em> it.
      </>
    );
  if (st.consistencyOk === false)
    return (
      <>
        One day is carrying the account. Stack <em>normal</em> days.
      </>
    );
  if (survivable !== null)
    return (
      <>
        You could absorb <em>{countWord(survivable)}</em> more {survivable === 1 ? "day" : "days"} like your worst.
      </>
    );
  return (
    <>
      No losing day yet. Keep it <em>boring</em>.
    </>
  );
}

/** 01 — Status: where the account stands against every rule, as editorial figures. */
export function StatusSection({
  prop,
  st,
  mc,
  brokerBalance,
  n,
}: {
  prop: PropSettings;
  st: PropStatus;
  mc: MonteCarloResult | null;
  brokerBalance: number | null;
  n: number;
}) {
  const worstDay = Math.min(0, ...st.dailyPnls);
  const survivable = worstDay < 0 ? Math.max(0, Math.floor(st.cushion / -worstDay)) : null;
  const toGo = st.requiredProfit !== null ? Math.max(0, st.requiredProfit - st.profit) : null;
  const raised = st.requiredProfit !== null && prop.profitTarget !== null && st.requiredProfit > prop.profitTarget;
  const funded = prop.profitTarget === null;
  const noOdds = `after five trading days · ${st.tradingDays} so far`;

  return (
    <Section id="status" n={n} label="Status" aside={<span className="eyebrow">since {shortDay(prop.startDate)}</span>} lead={statusLead(st, survivable)}>
      <Stats>
        <Figure value={fmtMoney(st.balance)} label="Balance" sub={<>started at {fmtMoney(prop.startBalance)}</>} />
        <Figure
          value={fmtMoney(st.profit, { sign: true })}
          tone={tone(st.profit)}
          label="Profit"
          sub={<>best close {fmtMoney(st.highWater)}</>}
          d={80}
        />
        <Figure
          value={fmtMoney(st.cushion)}
          tone={st.cushion < 0 ? "neg" : null}
          label={st.breached ? "Past the line" : "Cushion to the line"}
          sub={<>floor {fmtMoney(st.floor)}</>}
          d={160}
        >
          <Meter value={Math.min(1, st.cushionPct)} tone={st.cushionPct < 0.25 ? "gold" : "pos"} label="Cushion remaining" />
        </Figure>
        {toGo !== null ? (
          <Figure
            value={toGo === 0 ? "Met" : fmtMoney(toGo)}
            tone={toGo === 0 ? "pos" : null}
            label={toGo === 0 ? "Profit target" : "To the target"}
            sub={
              raised
                ? `consistency raised it to ${fmtMoney(st.requiredProfit!)}`
                : st.daysToTarget === 0
                  ? "target reached"
                  : st.daysToTarget !== null
                    ? `~${st.daysToTarget} days at your pace`
                    : "your average day is negative"
            }
            d={240}
          >
            <Meter value={st.targetProgress ?? 0} label="Progress to target" />
          </Figure>
        ) : (
          <Figure value={fmtMoney(st.highWater)} label="Best close" sub="funded — no profit target" d={240} />
        )}

        {mc ? (
          <>
            <Figure
              value={pct(funded ? mc.openProb : mc.passProb)}
              unit="%"
              tone={(funded ? mc.openProb : mc.passProb) > 0 ? "pos" : null}
              label={funded ? "Still standing · 30 days" : "Pass odds · 30 days"}
              sub={funded ? "of four thousand futures" : mc.medianDaysToPass ? `median ${mc.medianDaysToPass} trading days` : "no future passes in time"}
            />
            <Figure
              value={pct(mc.bustProb)}
              unit="%"
              label="Bust odds · 30 days"
              sub={mc.bustProb > 0.25 ? "more than one in four — size down" : mc.bustProb > 0.1 ? "respect it" : "the line is far away"}
              d={80}
            />
          </>
        ) : (
          <>
            {/* No odds yet (or none to give on a closed account): the two days that matter instead. */}
            <Figure
              value={worstDay < 0 ? fmtMoney(worstDay) : "—"}
              tone={worstDay < 0 ? "neg" : null}
              label="Worst day"
              sub={st.breached ? "the day not to repeat" : `odds ${noOdds}`}
            />
            <Figure
              value={st.tradingDays ? fmtMoney(st.avgDay, { sign: true }) : "—"}
              tone={tone(st.avgDay)}
              label="Average day"
              sub={st.tradingDays ? `across ${st.tradingDays} trading ${st.tradingDays === 1 ? "day" : "days"}` : "none yet"}
              d={80}
            />
          </>
        )}
        <Figure
          value={st.consistencyShare !== null ? pct(st.consistencyShare) : st.bestDay > 0 ? fmtMoney(st.bestDay, { sign: true }) : "—"}
          unit={st.consistencyShare === null ? undefined : "%"}
          tone={st.consistencyShare === null && st.bestDay > 0 ? "pos" : null}
          label={prop.consistencyPct ? `Best day · rule ${prop.consistencyPct}%` : "Best day share"}
          sub={
            st.consistencyShare === null ? (
              st.bestDay > 0 ? (
                "share counts once you're in profit"
              ) : (
                "no winning day yet"
              )
            ) : (
              <>
                <Money>{fmtMoney(st.bestDay, { sign: true })}</Money>
                {st.consistencyOk === false ? " · over the rule" : " · within the rule"}
              </>
            )
          }
          d={160}
        >
          {prop.consistencyPct ? (
            <Meter
              value={st.consistencyShare ?? 0}
              mark={prop.consistencyPct / 100}
              tone={st.consistencyOk === false ? "gold" : "pos"}
              label="Best day share of profit"
            />
          ) : null}
        </Figure>
        <Figure
          value={st.tradingDays}
          label="Trading days"
          sub={
            !mc ? (
              `since ${shortDay(prop.startDate)}`
            ) : st.tradingDays ? (
              <>
                average day <Money>{fmtMoney(st.avgDay, { sign: true })}</Money>
              </>
            ) : (
              "none yet"
            )
          }
          d={240}
        />
      </Stats>

      <p className={foot}>
        The max loss follows your best end-of-day balance and stops trailing once it reaches {fmtMoney(prop.startBalance)}. Intraday swings
        don&apos;t move it; a close above {fmtMoney(st.highWater)} does.
        {survivable !== null && !st.breached && (
          <>
            {" "}
            Your worst day was <Money>{fmtMoney(worstDay)}</Money>.
          </>
        )}
        {brokerBalance !== null && <> The broker reports {fmtMoney(brokerBalance)} for this account.</>}
        {prop.maxContracts ? <> Size cap: {prop.maxContracts} minis.</> : null}
      </p>
    </Section>
  );
}

function Read({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">{label}</dt>
      <dd className="num mt-2.5 text-[13.5px] tracking-[0.02em] whitespace-nowrap text-ink">{children}</dd>
    </div>
  );
}

/** 02 — The odds: the Monte Carlo fan and what it means. */
export function OddsSection({ prop, st, mc, target, n }: { prop: PropSettings; st: PropStatus; mc: MonteCarloResult | null; target: number | null; n: number }) {
  const end = mc?.bands[mc.bands.length - 1];
  return (
    <Section
      id="odds"
      n={n}
      label="The odds"
      aside={mc ? <span className="eyebrow max-sm:hidden">{mc.sims.toLocaleString("en-US")} futures · {mc.horizon} days</span> : null}
      lead={
        mc ? (
          <>
            Four thousand futures, built from <em>your</em> days.
          </>
        ) : undefined
      }
    >
      {mc && end ? (
        <>
          <div className="reveal">
            <FanChart bands={mc.bands} target={target} floor={st.floor} />
          </div>
          <dl className="reveal mt-[clamp(2.6rem,6vh,3.6rem)] grid grid-cols-2 gap-x-8 gap-y-8 border-t border-line pt-[clamp(1.8rem,4vh,2.4rem)] lg:grid-cols-4">
            <Read label={`Median · day ${mc.horizon}`}>
              <span className={end.p50 >= st.balance ? "text-pos" : undefined}>{fmtMoney(end.p50)}</span>
            </Read>
            <Read label="Middle 80%">
              {fmtMoney(end.p10, { compact: true })} – {fmtMoney(end.p90, { compact: true })}
            </Read>
            {prop.profitTarget !== null ? (
              <Read label="Median time to pass">{mc.medianDaysToPass ? `${mc.medianDaysToPass} trading days` : "beyond 30 days"}</Read>
            ) : (
              <Read label="Still standing">{pct(mc.openProb)}%</Read>
            )}
            <Read label="Built from">
              your last {Math.min(60, st.dailyPnls.length)} days
            </Read>
          </dl>
          <p className={foot}>
            Each future resamples your own trading days with the trailing max loss, the daily limit and the consistency rule applied. The band holds
            the middle 80% of outcomes; the jade line is the median. Scrub the chart to read any day.
          </p>
        </>
      ) : st.breached ? (
        <Empty
          title={
            <>
              No odds on a closed account. The next one starts <em>clean</em>.
            </>
          }
        >
          Log the reset in the ledger below, then point the rules at the new account. Guardian will simulate it after five trading days.
        </Empty>
      ) : (
        <Empty
          title={
            <>
              Five trading days, then the <em>future</em>.
            </>
          }
        >
          Guardian needs at least five trading days on this account before it can simulate your odds. So far: {st.tradingDays}.
        </Empty>
      )}
    </Section>
  );
}

export function GuardianQuote({ line }: { line?: { line: string; cite: string } }) {
  return (
    <section className="py-[clamp(4rem,12vh,9rem)]">
      <Quote cite={line?.cite ?? "Guardian"}>{line?.line ?? <>The cheapest evaluation is the one you don&apos;t buy twice.</>}</Quote>
    </section>
  );
}
