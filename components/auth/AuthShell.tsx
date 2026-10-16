import { LivingLine } from "@/components/charts/LivingLine";
import { Dot } from "@/components/m";

/** A calm, deterministic tape for the lock screen: it drifts up with honest pullbacks. */
const TAPE = Array.from({ length: 64 }, (_, i) => Math.round((Math.sin(i / 4.2) * 9 + Math.sin(i / 1.7) * 4 + i * 1.15) * 10) / 10);

/**
 * The lock screen frame: the mark top-left, an "encrypted" status top-right,
 * the living line underneath everything, and one quiet column of content.
 */
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-dvh flex-col px-[clamp(1.25rem,5vw,4rem)] py-[clamp(1.25rem,4vh,2.5rem)]">
      <header className="flex items-start justify-between gap-6 font-mono text-[9.5px] tracking-[0.34em] uppercase">
        <div>
          <div className="text-ink">
            Thunder <span className="text-gold">◆</span>
          </div>
          <div className="mt-1.5 text-ink-4 max-sm:hidden">Private journal</div>
        </div>
        <div className="text-right text-ink-4">
          <div className="text-pos">
            <Dot className="mr-2" />
            Encrypted
          </div>
          <div className="mt-1.5 max-sm:hidden">AES-256-GCM · read-only</div>
        </div>
      </header>
      <main className={`relative z-10 mx-auto flex w-full flex-1 flex-col justify-center py-12 ${wide ? "max-w-3xl" : "max-w-[440px]"}`}>{children}</main>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[3vh] opacity-40">
        <LivingLine values={TAPE} height={120} />
      </div>
    </div>
  );
}
