"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { lockNow } from "@/lib/actions/auth";
import { isActive, NAV } from "./nav";

/** A terminal index: numbered, lettered, a gold rule marks where you are. */
function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      setT(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return <span className="num tracking-[0.12em]">{t || "--:--:--"}</span>;
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-line bg-bg px-7 py-8 lg:flex">
      <Link href="/" className="mb-14 block">
        <div className="font-mono text-[12px] tracking-[0.42em] text-ink">
          THUNDER<span className="text-gold"> ◆</span>
        </div>
        <div className="eyebrow mt-1 !text-[9px]">Private journal</div>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label }, i) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("group flex h-9 items-center gap-3 font-mono text-[10.5px] tracking-[0.22em] uppercase transition-colors duration-300", active ? "text-ink" : "text-ink-4 hover:text-ink-2")}
            >
              <span className={cn("text-[9.5px]", active ? "text-gold" : "")}>{String(i).padStart(2, "0")}</span>
              <i className={cn("block h-px transition-all duration-300", active ? "w-[30px] bg-gold" : "w-[14px] bg-line-2 group-hover:w-5")} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 border-t border-line pt-5 font-mono text-[10px] tracking-[0.22em] uppercase">
        <Link href="/settings" className={cn("flex h-9 items-center transition-colors", isActive(pathname, "/settings") ? "text-ink" : "text-ink-4 hover:text-ink-2")}>
          Settings
        </Link>
        <form action={lockNow}>
          <button className="flex h-9 w-full items-center tracking-[0.22em] text-ink-4 uppercase transition-colors hover:text-ink-2">Lock</button>
        </form>
        <div className="mt-5 text-[9.5px] leading-[1.9] tracking-[0.2em] text-ink-4">
          <span className="text-pos">● Live</span> · journal
          <br />
          <Clock /> local
        </div>
      </div>
    </aside>
  );
}
