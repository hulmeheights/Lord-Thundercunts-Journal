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
    default: active ? "bg-ink text-bg border-transparent" : "bg-surface text-ink-2 border-line-2 hover:text-ink hover:border-ink-4",
    pos: "bg-sage text-pos border-transparent",
    neg: "bg-neg-fill text-neg border-transparent",
    brand: "bg-sage text-pos border-transparent",
    warn: "bg-fill-2 text-warn border-transparent",
  } as const;
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors duration-200",
        tones[tone],
        onClick && "active:scale-[0.97]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
