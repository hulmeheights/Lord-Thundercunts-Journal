const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/**
 * Guardian's page head, laid out like Meridian's HUD: the eyebrow on the left
 * and the balance on the right share the top line, and the serif statement
 * runs the full width beneath them — on a phone as much as on a desktop.
 *
 * (The kit's PageHead puts its meta beside the title, which squeezes a long
 * headline into a narrow column at 390px.)
 */
export function Head({ eyebrow, title, meta }: { eyebrow: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <header className="pt-6 pb-[clamp(2.6rem,7vh,4.6rem)] sm:pt-10">
      <div className="flex items-start justify-between gap-x-6 sm:gap-x-10">
        <div className="eyebrow reveal min-w-0 !tracking-[0.42em] max-sm:!tracking-[0.3em]">{eyebrow}</div>
        {meta && (
          <div className="reveal shrink-0 text-right font-mono" style={d(200)}>
            {meta}
          </div>
        )}
      </div>
      <h1
        className="reveal mt-[clamp(1.8rem,5vh,3.2rem)] font-serif text-[clamp(2.5rem,5.8vw,5.4rem)] leading-[1.02] font-light tracking-[-0.01em] text-balance [&_em]:italic"
        style={d(80)}
      >
        {title}
      </h1>
    </header>
  );
}
