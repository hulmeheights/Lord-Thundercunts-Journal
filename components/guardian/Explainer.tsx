import { Row, Rows, Section } from "@/components/m";

const ROWS = [
  {
    title: "The trailing max loss",
    desc: "Every day replayed against your firm's end-of-day drawdown, so you always know how far the line is — in dollars, not in feelings.",
  },
  {
    title: "The daily limit",
    desc: "Today's loss against the daily cap, as your trades sync. You'll see the wall long before you reach it.",
  },
  {
    title: "Consistency",
    desc: "Your best day's share of the profit against the rule, so one big day never quietly raises your target.",
  },
  {
    title: "The odds",
    desc: "Four thousand futures resampled from your own trading days: the chance you pass, the chance you blow it, and how long it should take.",
  },
];

/** What Guardian watches — shown while tracking is off. */
export function Explainer({ n }: { n: number }) {
  return (
    <Section
      id="watch"
      n={n}
      label="What it watches"
      lead={
        <>
          Four rules decide every evaluation. Guardian keeps <em>all four</em> in view.
        </>
      }
    >
      <Rows>
        {ROWS.map((r, i) => (
          <Row key={r.title} i={String(i + 1).padStart(2, "0")} title={r.title} desc={r.desc} d={i * 60} />
        ))}
      </Rows>
    </Section>
  );
}
