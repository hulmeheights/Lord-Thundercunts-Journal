/** The rule you trade by, written once so it's there if you ever forget it. */
const RULE = {
  headline: "I pass one first. Then I build, but the risk stays where it belongs.",
  steps: [
    "One eval, heavy ($600). Nothing else bought until it passes.",
    "Passed → funded at $300, never heavy. Then up to 4 more: 1 heavy eval at $600, 3 light at $300.",
    "Same trades on every account, in my window only, 2 trades max.",
    "5 accounts at most until my first payout.",
    "Heavy eval fails → wait 24 hours. Light eval fails → no replacement until the next pass or payout.",
    "Evals from the trading pot only. No bills money, no credit card.",
    "Red across every account → done for the day.",
  ],
  why: "Heavy where losing only costs a fee. Light where losing costs a funded account.",
  warning: "“I need this to pay” means I'm trading the debt, not the chart. Close the platform.",
};

/** Folded to one line at the foot of Guardian; tap to read it in full. */
export function MyRule() {
  const { headline, steps, why, warning } = RULE;
  return (
    <details className="group reveal border-y border-line">
      <summary className="flex cursor-pointer list-none items-center gap-4 py-4 [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] text-gold">◆</span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] tracking-[0.36em] text-ink-4 uppercase">My rule</span>
          <span className="mt-1.5 block font-serif text-[clamp(1.05rem,2.6vw,1.3rem)] leading-snug text-ink">{headline}</span>
        </span>
        <span className="shrink-0 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase group-open:hidden">Read</span>
        <span className="hidden shrink-0 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase group-open:inline">Fold</span>
      </summary>
      <ol className="space-y-3 pb-5 pl-[1.9rem]">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_1fr] font-mono text-[11.5px] leading-[1.8] text-ink-2">
            <span className="num text-ink-4">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="space-y-3 border-t border-line py-4 pl-[1.9rem] font-mono text-[11px] leading-[1.8]">
        <p className="text-ink-3">
          <span className="mr-2 text-[9px] tracking-[0.3em] text-ink-4 uppercase">Why</span>
          {why}
        </p>
        <p className="text-ink-2">
          <span className="mr-2 text-[9px] tracking-[0.3em] text-gold uppercase">If I feel it</span>
          {warning}
        </p>
      </div>
    </details>
  );
}
