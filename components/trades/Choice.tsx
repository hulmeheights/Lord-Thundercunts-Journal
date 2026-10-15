import { cn } from "@/lib/cn";

/**
 * A selectable kit-style Tag. Gold ◆ when chosen (setups), cream × when
 * flagged (mistakes) — never a coloured fill.
 */
export function Choice({
  active,
  tone = "gold",
  onClick,
  children,
  className,
}: {
  active: boolean;
  tone?: "gold" | "neg";
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-[2px] border px-3 font-mono text-[9.5px] tracking-[0.18em] whitespace-nowrap uppercase transition-[color,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        active
          ? tone === "gold"
            ? "border-gold/60 text-gold"
            : "border-ink/45 text-neg"
          : "border-line text-ink-3 hover:border-line-2 hover:text-ink-2",
        className,
      )}
    >
      {active && <span aria-hidden className="text-[0.85em] leading-none">{tone === "gold" ? "◆" : "×"}</span>}
      {children}
    </button>
  );
}
