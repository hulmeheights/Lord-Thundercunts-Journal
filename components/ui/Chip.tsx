import { cn } from "@/lib/cn";

export function Chip({
  children,
  active,
  onClick,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "pos" | "neg" | "brand" | "warn";
  className?: string;
}) {
  const tones = {
    default: active ? "border-ink text-ink bg-fill-2" : "border-line text-ink-3 hover:text-ink hover:border-line-2",
    pos: "border-pos/40 text-pos",
    neg: "border-line-2 text-neg",
    brand: "border-pos/40 text-pos",
    warn: "border-gold/50 text-gold",
  } as const;
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 border px-2.5 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase transition-colors duration-300",
        tones[tone],
        className,
      )}
    >
      {children}
    </Comp>
  );
}
