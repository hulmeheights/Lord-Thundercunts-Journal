import { d } from "./Rise";

/**
 * The trade's masthead — the kit PageHead's language, composed for a single
 * execution: back cue, eyebrow, the serif title with one italic word, a mono
 * sentence, and the net as the HUD figure. On a phone everything stacks
 * full-width (title → sentence → net, like Meridian's hero → line → price); on
 * desktop the net sits right, on the title's baseline. Rises on first paint.
 */
export function TradeHead({
  cue,
  eyebrow,
  title,
  sub,
  meta,
}: {
  cue?: React.ReactNode;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className="pt-2 pb-[clamp(3.5rem,10vh,7rem)] sm:pt-4">
      {cue && <div className="t-rise">{cue}</div>}
      {eyebrow && (
        <div className="t-rise eyebrow mt-[clamp(2.6rem,7vh,4.5rem)] !tracking-[0.3em] sm:!tracking-[0.42em]" style={d(60)}>
          {eyebrow}
        </div>
      )}
      <div className="mt-[clamp(1.4rem,3.5vh,2.4rem)] grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_auto]">
        <h1
          className="t-rise font-serif text-[clamp(2.9rem,10.5vw,6rem)] leading-[1] font-light tracking-[-0.01em] [&_em]:italic lg:col-start-1 lg:row-start-1"
          style={d(120)}
        >
          {title}
        </h1>
        {sub && (
          <p
            className="t-rise mt-[clamp(1.6rem,3.8vh,2.4rem)] max-w-[40ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2 lg:col-start-1 lg:row-start-2"
            style={d(200)}
          >
            {sub}
          </p>
        )}
        {meta && (
          <div className="t-rise mt-[clamp(2.4rem,6vh,3.2rem)] font-mono lg:col-start-2 lg:row-start-1 lg:mt-0 lg:self-end lg:pb-[0.35rem] lg:text-right" style={d(280)}>
            {meta}
          </div>
        )}
      </div>
    </header>
  );
}
