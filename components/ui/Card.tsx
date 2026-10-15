import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  as: As = "section",
  padded = true,
  lift = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  padded?: boolean;
  lift?: boolean;
}) {
  return <As className={cn("relative overflow-hidden rounded-[3px] border border-line bg-surface", padded && "p-[clamp(1.5rem,3vw,2.4rem)]", lift && "lift", className)}>{children}</As>;
}

export function CardHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="label mb-3">{eyebrow}</div>}
        {title && <h2 className="font-serif text-[clamp(1.4rem,2.6vw,1.9rem)] leading-[1.2] font-light [&_em]:italic">{title}</h2>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="title-xl">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
