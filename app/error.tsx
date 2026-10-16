"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col justify-center px-[clamp(1.25rem,5vw,4rem)]">
      <div className="label mb-8">Interrupted</div>
      <h1 className="max-w-[16ch] font-serif text-[clamp(2.4rem,7vw,5rem)] leading-[1.02] font-light tracking-[-0.01em]">
        Something went <em>sideways</em>.
      </h1>
      <p className="mt-6 max-w-[44ch] font-mono text-[12px] leading-[1.9] text-ink-2">It was contained and nothing was lost. Try again; if it keeps happening, check the database connection in Vercel.</p>
      <div className="mt-10">
        <button onClick={reset} className="inline-flex h-[52px] items-center border border-ink bg-ink px-8 font-mono text-[11px] tracking-[0.26em] text-bg uppercase transition-colors duration-300 hover:bg-transparent hover:text-ink">
          Try again
        </button>
      </div>
    </div>
  );
}
