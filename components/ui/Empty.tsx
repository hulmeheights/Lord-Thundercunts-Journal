import { cn } from "@/lib/cn";

export function Empty({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-fill-2 text-ink-2">{icon}</div>}
      <div className="text-[17px] font-semibold tracking-[-0.01em]">{title}</div>
      {children && <div className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-3">{children}</div>}
    </div>
  );
}
