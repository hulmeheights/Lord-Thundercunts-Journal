"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { isActive, NAV } from "./nav";

// Five tabs max on phones; Guardian and the Observer are reached from Today.
const MOBILE = NAV.filter((n) => n.href !== "/guardian" && n.href !== "/observer");

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(12px+var(--safe-bottom))] lg:hidden">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-around rounded-full px-2 py-1.5">
        {MOBILE.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className="relative flex h-[50px] flex-1 flex-col items-center justify-center gap-1">
              <Icon size={20} className={cn("relative transition-colors", active ? "text-ink" : "text-ink-4")} />
              <span className={cn("relative text-[10px] font-medium tracking-[0.01em] transition-colors", active ? "text-ink" : "text-ink-4")}>{label}</span>
              {active && (
                <motion.span
                  layoutId="tab-dot"
                  className="absolute top-1 h-1 w-1 rounded-full bg-glow shadow-[0_0_10px_var(--glow)]"
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
