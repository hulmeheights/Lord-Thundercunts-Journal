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
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon && <div className="mb-5 grid h-14 w-14 place-items-center rounded-full border border-line-2 text-ink-3">{icon}</div>}
      <div className="title-lg">{title}</div>
      {children && <div className="mt-2.5 max-w-sm text-[14.5px] leading-relaxed text-ink-3">{children}</div>}
    </div>
  );
}
