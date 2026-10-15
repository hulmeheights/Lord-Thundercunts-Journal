"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Meridian's right-edge index: 00 —— for each section, the current one in gold. Desktop only. */
export function SectionIndex({ ids }: { ids: string[] }) {
  const [on, setOn] = useState(ids[0]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setOn(e.target.id)),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);
  return (
    <nav aria-label="Sections" className="fixed top-1/2 right-[clamp(1.2rem,3vw,2.5rem)] z-30 hidden -translate-y-1/2 flex-col items-end gap-3.5 font-mono text-[9px] tracking-[0.22em] xl:flex">
      {ids.map((id, i) => (
        <a key={id} href={`#${id}`} className={cn("flex items-center gap-2.5 transition-colors duration-300", on === id ? "text-ink" : "text-ink-4 hover:text-ink-2")}>
          <span>{String(i).padStart(2, "0")}</span>
          <i className={cn("block h-px transition-all duration-300", on === id ? "w-[30px] bg-gold" : "w-[14px] bg-line-2")} />
        </a>
      ))}
    </nav>
  );
}
