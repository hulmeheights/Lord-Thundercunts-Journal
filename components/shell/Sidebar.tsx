"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { LogoMark, Wordmark } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { lockNow } from "@/lib/actions/auth";
import { isActive, NAV } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

/** Typographic rail: no icon clutter, an emerald dot marks where you are. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-line bg-bg/80 px-6 py-8 backdrop-blur-xl lg:flex">
      <Link href="/" className="mb-12 flex items-center gap-3">
        <LogoMark size={34} />
        <Wordmark />
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ href, label }, i) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex h-10 items-center gap-3 text-[14.5px] tracking-[-0.01em] transition-colors duration-200",
                active ? "text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              <span className="num w-5 text-[10.5px] text-ink-4 transition-colors group-hover:text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className={cn("font-medium", active && "font-semibold")}>{label}</span>
              {active && (
                <motion.span
                  layoutId="rail-dot"
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-glow shadow-[0_0_12px_var(--glow)]"
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t border-line pt-5">
        <Link
          href="/settings"
          className={cn("flex h-10 items-center text-[14px] transition-colors", isActive(pathname, "/settings") ? "text-ink" : "text-ink-3 hover:text-ink")}
        >
          Settings
        </Link>
        <form action={lockNow}>
          <button className="flex h-10 w-full items-center text-[14px] text-ink-3 transition-colors hover:text-ink">Lock</button>
        </form>
        <ThemeToggle className="mt-3" withLabel />
      </div>
    </aside>
  );
}
