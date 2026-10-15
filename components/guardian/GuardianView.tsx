import { Section, Stat, Stats, Empty, Quote } from "@/components/m";
import { FanChart } from "@/components/charts/FanChart";
import type { MonteCarloResult, PropStatus } from "@/lib/analytics/prop";
import type { PropSettings } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
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
export function StatusSection({ prop, st, brokerBalance, n }: { prop: PropSettings; st: PropStatus; brokerBalance: number | null; n: number }) {
  const worstDay = Math.min(0, ...st.dailyPnls);
  const survivable = worstDay < 0 ? Math.max(0, Math.floor(st.cushion / -worstDay)) : null;
  const toGo = st.requiredProfit !== null ? Math.max(0, st.requiredProfit - st.profit) : null;
  const raised = st.requiredProfit !== null && prop.profitTarget !== null && st.requiredProfit > prop.profitTarget;
  const dailyLeft = prop.dailyLossLimit ? Math.max(0, prop.dailyLossLimit + Math.min(0, st.todayPnl)) : null;

  return (
    <Section id="status" n={n} label="Status" aside={<span className="eyebrow">since {shortDay(prop.startDate)}</span>} lead={statusLead(st, survivable)}>
      <Stats>
        <Stat value={fmtMoney(st.balance)} label="Balance" sub={`started at ${fmtMoney(prop.startBalance)}`} />
        <Stat value={fmtMoney(st.profit, { sign: true })} tone={tone(st.profit)} label="Profit" sub={`best close ${fmtMoney(st.highWater)}`} d={80} />
        <Stat
          value={fmtMoney(st.cushion)}
          label="Cushion to the line"
          sub={
            <>
              floor {fmtMoney(st.floor)}
              <Meter value={Math.min(1, st.cushionPct)} tone={st.cushionPct < 0.25 ? "gold" : "pos"} label="Cushion remaining" />
            </>
          }
          d={160}
        />
        {toGo !== null ? (
          <Stat
            value={toGo === 0 ? "Met" : fmtMoney(toGo)}
            tone={toGo === 0 ? "pos" : null}
            label={toGo === 0 ? "Profit target" : "To the target"}
            sub={
              <>
                {raised
                  ? `consistency raised it to ${fmtMoney(st.requiredProfit!)}`
                  : st.daysToTarget === 0
                    ? "target reached"
                    : st.daysToTarget !== null
                      ? `~${st.daysToTarget} trading days at your pace`
                      : "your average day is negative"}
                <Meter value={st.targetProgress ?? 0} label="Progress to target" />
              </>
            }
            d={240}
          />
        ) : (
          <Stat value={fmtMoney(st.highWater)} label="Best close" sub="funded — no profit target" d={240} />
        )}

        <Stat
          value={dailyLeft !== null ? fmtMoney(dailyLeft) : "Off"}
          label={dailyLeft !== null ? "Daily limit left" : "Daily loss limit"}
          sub={
            dailyLeft !== null ? (
              <>
                today {fmtMoney(st.todayPnl, { sign: true })} of {fmtMoney(-prop.dailyLossLimit!)}
                <Meter value={st.dailyLossUsed ?? 0} tone="neg" label="Daily loss used" />
              </>
            ) : (
              "no daily cap on this account"
            )
          }
        />
        <Stat
          value={st.consistencyShare === null ? "—" : pct(st.consistencyShare)}
          unit={st.consistencyShare === null ? undefined : "%"}
          label={prop.consistencyPct ? `Best day · limit ${prop.consistencyPct}%` : "Best day share"}
          sub={
            <>
              best day {fmtMoney(st.bestDay, { sign: true })}
              {prop.consistencyPct ? (
                <Meter value={st.consistencyShare ?? 0} mark={prop.consistencyPct / 100} tone={st.consistencyOk === false ? "gold" : "pos"} label="Best day share of profit" />
              ) : null}
            </>
          }
          d={80}
        />
        <Stat value={st.tradingDays} label="Trading days" sub={st.tradingDays ? `average day ${fmtMoney(st.avgDay, { sign: true })}` : "none yet"} d={160} />
        <Stat
          value={survivable === null ? "—" : survivable}
          label="Worst days to absorb"
          sub={survivable === null ? "no losing day yet" : `worst day ${fmtMoney(worstDay)}`}
          d={240}
        />
      </Stats>

      <p className={foot}>
        The max loss follows your best end-of-day balance and stops trailing once it reaches {fmtMoney(prop.startBalance)}. Intraday swings
        don&apos;t move it; a close above {fmtMoney(st.highWater)} does.
        {brokerBalance !== null && <> The broker reports {fmtMoney(brokerBalance)} for this account.</>}
        {prop.maxContracts ? <> Size cap: {prop.maxContracts} minis.</> : null}
      </p>
    </Section>
  );
}

/** 02 — The odds: the Monte Carlo fan and what it means. */
export function OddsSection({ prop, st, mc, target, n }: { prop: PropSettings; st: PropStatus; mc: MonteCarloResult | null; target: number | null; n: number }) {
  return (
    <Section
      id="odds"
      n={n}
      label="The odds"
      aside={mc ? <span className="eyebrow">{mc.sims.toLocaleString("en-US")} futures · {mc.horizon} days</span> : null}
      lead={
        <>
          Four thousand futures, built from <em>your</em> days.
        </>
      }
    >
      {mc ? (
        <>
          <div className="reveal">
            <FanChart bands={mc.bands} target={target} floor={st.floor} />
          </div>
          <Stats cols={3} className="mt-[clamp(3.5rem,8vh,5rem)]">
            {prop.profitTarget !== null ? (
              <Stat value={pct(mc.passProb)} unit="%" tone={mc.passProb > 0 ? "pos" : null} label="Pass within 30 days" />
            ) : (
              <Stat value={pct(mc.openProb)} unit="%" tone="pos" label="Still standing in 30 days" />
            )}
            <Stat value={pct(mc.bustProb)} unit="%" label="Blow the account" sub={mc.bustProb > 0.25 ? "more than one in four — size down" : undefined} d={80} />
            {prop.profitTarget !== null ? (
              <Stat value={mc.medianDaysToPass ?? "—"} unit={mc.medianDaysToPass ? "days" : undefined} label="Median time to pass" d={160} />
            ) : (
              <Stat value={fmtMoney(mc.bands[mc.bands.length - 1]!.p50)} label="Median balance, day 30" d={160} />
            )}
          </Stats>
          <p className={foot}>
            Each future resamples your last {Math.min(60, st.dailyPnls.length)} trading days with the trailing max loss, the daily limit and the
            consistency rule applied. The band holds the middle 80% of outcomes; the jade line is the median. Scrub the chart to read any day.
          </p>
        </>
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

export function GuardianQuote() {
  return (
    <section className="py-[clamp(4rem,12vh,9rem)]">
      <Quote cite="Guardian">The cheapest evaluation is the one you don&apos;t buy twice.</Quote>
    </section>
  );
}
