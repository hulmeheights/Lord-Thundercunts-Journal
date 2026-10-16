"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { lockNow } from "@/lib/actions/auth";
import { isActive, NAV } from "./nav";

type LenisLike = { stop(): void; start(): void };

/** The phone's full index: every page as Meridian's numbered list, plus settings and lock. */
export function MobileIndex() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close whenever the route changes (adjusting state during render, not in an effect).
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    lenis?.stop();
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      lenis?.start();
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-expanded={open} className="font-mono text-[9.5px] tracking-[0.22em] text-ink-3 uppercase">
        Index ☰
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex flex-col bg-bg px-6 pt-[calc(14px+var(--safe-top))] pb-[calc(24px+var(--safe-bottom))] lg:hidden" role="dialog" aria-modal="true" aria-label="Index" data-lenis-prevent>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[12px] tracking-[0.42em] text-ink">
                  THUNDER<span className="text-gold"> ◆</span>
                </div>
                <div className="eyebrow !text-[9px]">Index</div>
              </div>
              <button onClick={() => setOpen(false)} className="font-mono text-[9.5px] tracking-[0.22em] text-ink-3 uppercase" autoFocus>
                Close ×
              </button>
            </div>
            <nav className="mt-10 flex-1 overflow-y-auto border-t border-line">
              {NAV.map((n, i) => {
                const on = isActive(pathname, n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="grid grid-cols-[2.5rem_1fr_auto] items-baseline border-b border-line py-4 motion-safe:animate-[ltj-rise_.7s_cubic-bezier(0.16,1,0.3,1)_both]"
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <span className={cn("font-mono text-[11px]", on ? "text-gold" : "text-ink-4")}>{String(i).padStart(2, "0")}</span>
                    <span className={cn("font-serif text-[1.9rem] leading-none font-light", on && "italic")}>{n.label}</span>
                    {on && <span className="text-gold">◆</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-[0.3em] uppercase">
              <Link href="/settings" className="text-ink-2">
                Settings
              </Link>
              <form action={lockNow}>
                <button type="submit" className="tracking-[0.3em] text-ink-4 uppercase">
                  Lock
                </button>
              </form>
            </div>
            <style>{"@keyframes ltj-rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}"}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
