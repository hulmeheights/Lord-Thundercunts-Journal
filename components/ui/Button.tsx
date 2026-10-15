import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] select-none whitespace-nowrap " +
  "transition-[transform,background-color,box-shadow,color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
  "active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  // Ink on paper / paper on night — the quiet default action.
  primary: "bg-ink text-bg hover:shadow-[0_10px_28px_-12px_color-mix(in_oklab,var(--ink)_55%,transparent)]",
  // Green is earned: the one action that moves you forward.
  brand:
    "bg-brand hover:shadow-[0_0_0_6px_color-mix(in_oklab,var(--glow)_18%,transparent),0_14px_34px_-14px_var(--glow)] data-[magnetic-on]:shadow-[0_0_0_6px_color-mix(in_oklab,var(--glow)_22%,transparent),0_16px_40px_-14px_var(--glow)]",
  secondary: "bg-surface text-ink border border-line-2 hover:border-ink-4",
  ghost: "text-ink-2 hover:text-ink hover:bg-fill-2",
  danger: "text-neg border border-line-2 bg-surface hover:bg-neg-fill",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-5 text-[14px]",
  lg: "h-[52px] px-7 text-[15px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  magnetic,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; magnetic?: boolean }) {
  const isMagnetic = magnetic ?? (variant === "brand" && size === "lg");
  return <button data-magnetic={isMagnetic ? "" : undefined} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  magnetic,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  magnetic?: boolean;
}) {
  const isMagnetic = magnetic ?? (variant === "brand" && size === "lg");
  return (
    <Link href={href} data-magnetic={isMagnetic ? "" : undefined} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
