"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { isActive, NAV } from "./nav";

// Five tabs max on phones; Guardian and the Observer are reached from cards on Today.
const MOBILE = NAV.filter((n) => n.href !== "/guardian" && n.href !== "/observer");

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(10px+var(--safe-bottom))] lg:hidden">
      <div className="glass-strong mx-auto flex max-w-md items-center justify-around rounded-[26px] px-1.5 py-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.9)]">
        {MOBILE.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className="relative flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5">
              {active && (
                <motion.span
                  layoutId="tab-active"
                  className="absolute inset-x-1 inset-y-0 rounded-[20px] bg-fill-2"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icon size={20} strokeWidth={active ? 2.3 : 1.8} className={cn("relative", active ? "text-ink" : "text-ink-3")} />
              <span className={cn("relative text-[10px] font-semibold", active ? "text-ink" : "text-ink-3")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
