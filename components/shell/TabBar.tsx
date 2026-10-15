"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isActive, NAV } from "./nav";

const MOBILE = NAV.filter((n) => n.href !== "/guardian" && n.href !== "/observer");

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[calc(6px+var(--safe-bottom))] backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {MOBILE.map(({ href, label }, i) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className="relative flex h-[58px] flex-1 flex-col items-center justify-center gap-1.5">
              <span className={cn("font-mono text-[9px]", active ? "text-gold" : "text-ink-4")}>{String(i).padStart(2, "0")}</span>
              <span className={cn("font-mono text-[9px] tracking-[0.2em] uppercase", active ? "text-ink" : "text-ink-4")}>{label}</span>
              {active && <i className="absolute top-0 h-px w-8 bg-gold" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
