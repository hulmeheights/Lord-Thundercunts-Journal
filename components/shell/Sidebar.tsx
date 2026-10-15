"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Lock, Settings } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { lockNow } from "@/lib/actions/auth";
import { isActive, NAV } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line bg-black/40 px-4 py-6 backdrop-blur-2xl lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <LogoMark size={38} />
        <Wordmark />
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-2xl px-3 text-[14.5px] font-medium transition-colors",
                active ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {active && (
                <motion.span
                  layoutId="side-active"
                  className="absolute inset-0 rounded-2xl border border-line bg-fill-2"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icon size={18} strokeWidth={active ? 2.3 : 1.9} className="relative" />
              <span className="relative">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <Link
          href="/settings"
          className={cn(
            "flex h-11 items-center gap-3 rounded-2xl px-3 text-[14.5px] font-medium transition-colors",
            isActive(pathname, "/settings") ? "bg-fill-2 text-ink" : "text-ink-3 hover:text-ink-2",
          )}
        >
          <Settings size={18} /> Settings
        </Link>
        <form action={lockNow}>
          <button className="flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-[14.5px] font-medium text-ink-3 transition-colors hover:text-ink-2">
            <Lock size={18} /> Lock
          </button>
        </form>
      </div>
    </aside>
  );
}
