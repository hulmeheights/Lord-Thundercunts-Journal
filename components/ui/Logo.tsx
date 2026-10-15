import { cn } from "@/lib/cn";

/**
 * The mark: a single emerald stroke that climbs — an equity line that
 * becomes a bolt. Hairline, no gradient blob. Brand slot for the wordmark.
 */
export function LogoMark({ size = 36, className, glow = false }: { size?: number; className?: string; glow?: boolean }) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} aria-hidden>
      {glow && <span className="absolute inset-[-35%] rounded-full bg-glow opacity-25 blur-2xl" />}
      <span className="relative grid h-full w-full place-items-center rounded-[30%] border border-line-2 bg-surface">
        <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} fill="none">
          <path d="M4 22.5 11 16l4.5 3.5L21 9.5l-1.2 7.2H28L17.5 27l1.6-7.1-4.1-3.1" stroke="var(--pos)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("leading-tight", className)}>
      <span className="block text-[13.5px] font-semibold tracking-[-0.02em] text-ink">Lord Thundercunts</span>
      <span className="eyebrow block !text-[9.5px]">Private journal</span>
    </span>
  );
}
