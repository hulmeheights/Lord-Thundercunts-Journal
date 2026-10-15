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
    default: active ? "bg-ink text-black border-transparent" : "bg-fill text-ink-2 border-line hover:text-ink hover:bg-fill-2",
    pos: "bg-pos/12 text-pos border-pos/20",
    neg: "bg-neg/12 text-neg border-neg/20",
    brand: "bg-indigo/15 text-cyan border-indigo/25",
    warn: "bg-orange/12 text-orange border-orange/20",
  } as const;
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors",
        tones[tone],
        onClick && "active:scale-[0.97]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
