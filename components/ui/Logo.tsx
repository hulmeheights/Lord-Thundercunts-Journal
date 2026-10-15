import { cn } from "@/lib/cn";

/** The app mark: a lightning bolt in a gradient squircle. */
export function LogoMark({ size = 36, className, glow = false }: { size?: number; className?: string; glow?: boolean }) {
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {glow && <span className="absolute inset-[-40%] rounded-full bg-brand opacity-40 blur-2xl" />}
      <span
        className="relative block h-full w-full overflow-hidden rounded-[25%] bg-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        style={{ backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%), var(--brand)" }}
      >
        <svg viewBox="0 0 64 64" width={size} height={size} className="absolute inset-0 h-full w-full">
          <path d="M36.5 9 17 36h12.5L26 55l21-29H34.2L36.5 9Z" fill="#fff" />
        </svg>
      </span>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("leading-tight", className)}>
      <span className="block text-[13px] font-semibold tracking-[-0.01em] text-ink">Lord Thundercunts</span>
      <span className="block text-[11px] font-medium tracking-[0.12em] text-ink-3 uppercase">Journal</span>
    </span>
  );
}
