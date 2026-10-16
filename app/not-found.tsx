import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-[clamp(1.25rem,5vw,4rem)]">
      <div className="label mb-8">404 — Off the tape</div>
      <h1 className="max-w-[14ch] font-serif text-[clamp(2.6rem,8vw,5.6rem)] leading-[1] font-light tracking-[-0.01em]">
        Nothing <em>here</em>, my Lord.
      </h1>
      <div className="mt-12 flex items-center gap-8">
        <Link href="/" className="inline-flex h-[52px] items-center border border-ink bg-ink px-8 font-mono text-[11px] tracking-[0.26em] text-bg uppercase transition-colors duration-300 hover:bg-transparent hover:text-ink">
          Back to today
        </Link>
        <Link href="/journal" className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase hover:text-ink">
          ← the journal
        </Link>
      </div>
    </div>
  );
}
