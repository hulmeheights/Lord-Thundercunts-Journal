"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { readUiPrefs, writeUiPrefs } from "@/lib/ui-prefs-client";
import { cn } from "@/lib/cn";

/** Paper ↔ Night session. */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [night, setNight] = useState(false);
  useEffect(() => {
    const p = readUiPrefs();
    setNight(p.theme === "night" || (p.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches));
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !night;
        setNight(next);
        writeUiPrefs({ theme: next ? "night" : "paper" });
      }}
      aria-label={night ? "Switch to paper" : "Switch to night session"}
      className={cn("inline-flex items-center gap-2.5 rounded-full text-ink-3 transition-colors hover:text-ink", className)}
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-full border border-line-2">
        {night ? <Moon size={15} /> : <Sun size={15} />}
      </span>
      {withLabel && <span className="text-[13.5px]">{night ? "Night session" : "Paper"}</span>}
    </button>
  );
}
