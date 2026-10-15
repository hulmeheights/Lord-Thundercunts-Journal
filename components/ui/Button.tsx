import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-[0.7em] font-mono uppercase tracking-[0.24em] select-none whitespace-nowrap border " +
  "transition-[background-color,color,border-color,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:opacity-40 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg border-ink hover:bg-transparent hover:text-ink",
  brand: "bg-ink text-bg border-ink hover:bg-transparent hover:text-ink",
  secondary: "bg-transparent text-ink-2 border-line-2 hover:border-ink hover:text-ink",
  ghost: "border-transparent text-ink-3 hover:text-ink",
  danger: "bg-transparent text-ink-2 border-line-2 hover:border-[#c9806f] hover:text-[#c9806f]",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[9.5px]",
  md: "h-10 px-5 text-[10.5px]",
  lg: "h-[52px] px-8 text-[11px]",
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
  const isMagnetic = magnetic ?? ((variant === "brand" || variant === "primary") && size === "lg");
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
  const isMagnetic = magnetic ?? ((variant === "brand" || variant === "primary") && size === "lg");
  return (
    <Link href={href} data-magnetic={isMagnetic ? "" : undefined} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
