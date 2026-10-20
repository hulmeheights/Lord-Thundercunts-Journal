"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Panel, Section, Stats } from "@/components/m";
import { Seg } from "@/components/m/Seg";
import { savePlan } from "@/lib/actions/settings";
import { DEFAULT_RATES, FIRM_PRICES, RATE_KEYS, planFor, ratesFrom, type Plan, type RateKey, type Rates, type RoadMedians } from "@/lib/analytics/plan";
import type { RoadCounts } from "@/lib/analytics/road";
import type { PlanSettings } from "@/lib/types";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Figure } from "./Figure";

export type PlanFirm = { firm: string; counts: RoadCounts | null; medians: RoadMedians };

const money = (n: number) => fmtMoney(n, { cents: false });
const firmKey = (f: string) => f.trim().replace(/\s+/g, "").toLowerCase();

const RATE_META: Record<RateKey, { label: string; unit: "%" | "$" | "×" | "days"; hint: string }> = {
  passRate: { label: "Pass rate", unit: "%", hint: "evals passed ÷ decided" },
  evalPrice: { label: "Price of an eval", unit: "$", hint: "evals + resets ÷ bought" },
  avgPayout: { label: "Average payout", unit: "$", hint: "what lands in your pocket" },
  payoutsPerFundedMonth: { label: "Payouts per funded account a month", unit: "×", hint: "payouts ÷ funded-months" },
  lossPerFundedMonth: { label: "Funded accounts lost a month", unit: "%", hint: "lost ÷ funded-months" },
  daysToPass: { label: "Days to pass", unit: "days", hint: "eval bought → passed" },
  daysToPayout: { label: "Days to first payout", unit: "days", hint: "passed → paid" },
};

const show = (k: RateKey, v: number) => {
  const u = RATE_META[k].unit;
  if (u === "%") return `${Math.round(v * 1000) / 10}%`;
  if (u === "$") return money(v);
  if (u === "×") return v.toFixed(2);
  return `${Math.round(v)}`;
};
const toInput = (k: RateKey, v: number) => (RATE_META[k].unit === "%" ? String(Math.round(v * 1000) / 10) : RATE_META[k].unit === "×" ? String(Math.round(v * 100) / 100) : String(Math.round(v)));
const fromInput = (k: RateKey, s: string): number | null => {
  const n = Number(s.replace(/[,$%\s]/g, ""));
  if (!s.trim() || !Number.isFinite(n) || n < 0) return null;
  return RATE_META[k].unit === "%" ? n / 100 : n;
};

function verdict(p: Plan, batch: number): React.ReactNode {
  return (
    <>
      To take home <em>{money(p.target)}</em> a month you need about <em>{p.liveFunded} funded accounts</em> live, paying around {Math.round(p.payoutsPerMonth)}{" "}
      payouts a month. Getting there takes about <em>{p.evalsToStart} evals</em> ({money(p.startFees)}){batch > 1 && <> copied {batch} at a time</>} — keep{" "}
      <em>{money(p.badStartFees)}</em> aside in case it goes badly. The first payout lands about {p.daysToFirstPayout} days after you buy.
    </>
  );
}

/** The income plan: a monthly target in, the accounts, evals, fees and real money it takes out. */
export function PlanSection({ n, initial, pooled, firms }: { n: number; initial: PlanSettings; pooled: PlanFirm; firms: PlanFirm[] }) {
  const [target, setTarget] = useState(String(initial.monthlyTarget || ""));
  const [batch, setBatch] = useState(String(initial.batch || 5));
  const [overrides, setOverrides] = useState<Partial<Rates>>(initial.overrides ?? {});
  const [mode, setMode] = useState<"each" | "split">("split");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = Math.max(0, Number(target.replace(/[,$\s]/g, "")) || 0);
  const b = Math.min(100, Math.max(1, Math.round(Number(batch) || 1)));

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => start(() => void savePlan({ monthlyTarget: Math.min(t, 10_000_000), batch: b, overrides })), 800);
    return () => void (timer.current && clearTimeout(timer.current));
  }, [t, b, overrides]);

  const base = useMemo(() => ratesFrom(pooled.counts, pooled.medians, DEFAULT_RATES, overrides), [pooled, overrides]);
  const plan = planFor(t, base.rates, b);
  const rows = useMemo(
    () =>
      firms.map((f) => {
        // A firm's own numbers where it has them; your overall rates (and its known price) where it doesn't.
        const fallback = { ...base.rates, evalPrice: FIRM_PRICES[firmKey(f.firm)] ?? base.rates.evalPrice };
        // A firm with its own results leans on the plain assumption, not on totals that already include it.
        if (f.counts && f.counts.passed + f.counts.blown >= 3) fallback.passRate = overrides.passRate ?? DEFAULT_RATES.passRate;
        const r = ratesFrom(f.counts, f.medians, fallback);
        return { firm: f.firm, r, plan: planFor(mode === "split" ? t / Math.max(1, firms.length) : t, r.rates, b) };
      }),
    [firms, base, mode, t, b, overrides],
  );

  return (
    <Section
      id="plan"
      n={n}
      label="The income plan"
      lead={
        <>
          What a month&apos;s <em>income</em> takes.
        </>
      }
    >
      <div className="reveal grid gap-x-10 gap-y-7 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <label className="block">
          <span className="mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Income you want a month</span>
          <span className="relative block">
            <span className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 font-mono text-[clamp(1.6rem,3.4vw,2.6rem)] font-light text-ink-4">$</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d,]/g, "").slice(0, 10))}
              inputMode="numeric"
              aria-label="Monthly income target"
              className="num w-full border-0 border-b border-line-2 bg-transparent pb-2 pl-[1.1em] font-mono text-[clamp(1.6rem,3.4vw,2.6rem)] font-light text-ink outline-none focus:border-gold"
            />
          </span>
        </label>
        <label className="block">
          <span className="mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Accounts copied per batch</span>
          <input
            value={batch}
            onChange={(e) => setBatch(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            inputMode="numeric"
            aria-label="Accounts copied per batch"
            className="num w-full border-0 border-b border-line-2 bg-transparent pb-2 font-mono text-[clamp(1.6rem,3.4vw,2.6rem)] font-light text-ink outline-none focus:border-gold"
          />
        </label>
      </div>

      {plan ? (
        <>
          <div className="mt-[clamp(3rem,7vh,4.5rem)]">
            <Panel gold>
              <div className="font-mono text-[9.5px] tracking-[0.34em] text-gold uppercase">◆ The plan</div>
              <p className="mt-6 max-w-[40ch] font-serif text-[clamp(1.35rem,2.6vw,2rem)] leading-[1.35] font-light tracking-[-0.01em] [&_em]:italic">{verdict(plan, b)}</p>
            </Panel>
          </div>

          <div className="mt-[clamp(3.5rem,8vh,5.5rem)]">
            <Stats cols={3}>
              <Figure size="lg" value={plan.liveFunded} label="Funded accounts live" sub={`${plan.payoutsPerMonth.toFixed(1)} payouts a month`} />
              <Figure size="lg" value={plan.evalsToStart} label="Evals to get there" sub={`${money(plan.startFees)} in fees, on average`} d={80} />
              <Figure
                size="lg"
                value={money(plan.realMoneyAtRisk)}
                tone="neg"
                label="Real money to keep aside"
                sub={`${plan.badStartEvals} evals if it goes badly · 1 in 10 is worse`}
                d={160}
              />
              <Figure size="lg" value={plan.evalsPerMonth.toFixed(1)} label="Evals a month to stay there" sub={`replacing ${plan.passesPerMonth.toFixed(1)} lost funded a month`} />
              <Figure size="lg" value={money(plan.monthlyFees)} label="Fees a month" sub={plan.feeShare !== null ? `${Math.round(plan.feeShare * 100)}% of the income` : undefined} d={80} />
              <Figure size="lg" value={money(plan.netPerMonth)} tone={plan.netPerMonth > 0 ? "pos" : "neg"} label="Net a month, once running" sub={`first payout ~${plan.daysToFirstPayout} days in`} d={160} />
            </Stats>
          </div>
        </>
      ) : (
        <p className="reveal mt-10 font-mono text-[11.5px] leading-[1.9] text-ink-3">Type the income you want a month to see the plan.</p>
      )}

      <div className="reveal mt-[clamp(3.5rem,8vh,5rem)]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
          <span className="eyebrow">What it&apos;s built on</span>
          <span className="eyebrow">yours = from your ledger · assumed until there&apos;s enough · type to set your own</span>
        </div>
        <div className="border-t border-line">
          {RATE_KEYS.map((k) => {
            const src = base.source[k];
            return (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_7rem] items-baseline gap-x-6 gap-y-1 border-b border-line py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem]">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.12em] text-ink uppercase">{RATE_META[k].label}</div>
                  <div className="mt-1 font-mono text-[10px] text-ink-4">{RATE_META[k].hint}</div>
                </div>
                <div className="font-mono text-[10.5px] text-ink-3 max-sm:col-span-2 max-sm:row-start-2">
                  <span className={cn("mr-2 tracking-[0.2em] uppercase", src === "yours" ? "text-pos" : src === "set" ? "text-gold" : "text-ink-4")}>{src}</span>
                  {base.basis[k]}
                  {src === "set" && (
                    <button
                      type="button"
                      className="ml-2 underline decoration-line-2 underline-offset-4 hover:text-ink"
                      onClick={() =>
                        setOverrides((o) => {
                          const next = { ...o };
                          delete next[k];
                          return next;
                        })
                      }
                    >
                      use mine
                    </button>
                  )}
                </div>
                <input
                  key={`${k}-${src}-${base.rates[k]}`}
                  defaultValue={toInput(k, base.rates[k])}
                  inputMode="decimal"
                  aria-label={RATE_META[k].label}
                  onBlur={(e) => {
                    const v = fromInput(k, e.target.value);
                    if (v === null || Math.abs(v - base.rates[k]) < 1e-9) return;
                    setOverrides((o) => ({ ...o, [k]: v }));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="num w-full border-0 border-b border-line bg-transparent py-1 text-right font-mono text-[13px] text-ink outline-none focus:border-gold"
                />
              </div>
            );
          })}
        </div>
      </div>

      {t > 0 && rows.length > 0 && (
        <div className="reveal mt-[clamp(3.5rem,8vh,5rem)]">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
            <span className="eyebrow">By firm</span>
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { value: "split", label: `Split across ${rows.length}` },
                { value: "each", label: "Whole target at each" },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[44rem]">
              <div className="grid grid-cols-[minmax(0,1.3fr)_repeat(7,minmax(0,0.9fr))] gap-x-4 border-b border-line pb-3 font-mono text-[9px] tracking-[0.2em] text-ink-4 uppercase">
                <span>Firm · {mode === "split" ? money(t / rows.length) : money(t)}</span>
                <span className="text-right">Pass</span>
                <span className="text-right">Eval</span>
                <span className="text-right">Payout</span>
                <span className="text-right">Funded</span>
                <span className="text-right">Evals</span>
                <span className="text-right">Keep aside</span>
                <span className="text-right">Net / mo</span>
              </div>
              {rows.map(({ firm, r, plan: p }) => (
                <div key={firm} className="grid grid-cols-[minmax(0,1.3fr)_repeat(7,minmax(0,0.9fr))] items-baseline gap-x-4 border-b border-line py-4">
                  <span className="truncate font-serif text-[clamp(1.1rem,1.8vw,1.3rem)] font-light">{firm}</span>
                  {(["passRate", "evalPrice", "avgPayout"] as RateKey[]).map((k) => (
                    <span key={k} className={cn("num text-right text-[12.5px]", r.source[k] === "yours" ? "text-ink" : "text-ink-4")} title={r.source[k] === "yours" ? r.basis[k] : "assumed"}>
                      {show(k, r.rates[k])}
                    </span>
                  ))}
                  <span className="num text-right text-[12.5px] text-ink">{p ? p.liveFunded : "—"}</span>
                  <span className="num text-right text-[12.5px] text-ink-2">{p ? p.evalsToStart : "—"}</span>
                  <span className="num text-right text-[12.5px] text-neg">{p ? money(p.badStartFees) : "—"}</span>
                  <span className={cn("num text-right text-[12.5px]", p && p.netPerMonth > 0 ? "text-pos" : "text-neg")}>{p ? money(p.netPerMonth) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 font-mono text-[10.5px] leading-[1.8] text-ink-4">
            Bright numbers are that firm&apos;s own; dim ones borrow your overall rates (and the eval price you pay there) until it has enough of its own. Check each
            firm&apos;s limit on how many funded accounts you can hold.
          </p>
        </div>
      )}

      <p className="reveal mt-[clamp(2.5rem,6vh,4rem)] max-w-[72ch] font-mono text-[11px] leading-[1.9] text-ink-4">
        Real money is only ever the fees: the drawdown on an eval or funded account is the firm&apos;s, not yours. &ldquo;Keep aside&rdquo; is what the evals
        could cost before enough of them pass when batches are copied and fail together. A plan, not a promise: it gets sharper with every result you log.
      </p>
    </Section>
  );
}
