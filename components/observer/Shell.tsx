"use client";

import { useCallback, useEffect, useState } from "react";
import type { Instruction, ObstacleKey } from "@/lib/analytics/observer";
import type { ObserverWindow } from "@/lib/data/observer";
import type { Settings } from "@/lib/types";
import { Btn } from "@/components/m";
import { cn } from "@/lib/cn";
import { Ritual } from "./Ritual";
import { textBtn } from "./ui";

/** Any "Step outside" button on the page opens the one ritual through this event. */
const OPEN = "observer:step-outside";

/**
 * Hosts the "Step outside" ritual for the whole page as a sibling of the
 * (server-rendered) case file, so the page itself stays a server component.
 * `?ritual=1` opens it on arrival.
 */
export function RitualHost({
  name,
  tell,
  window: win,
  aiReady,
  prefs,
  pinned,
  lastWant = null,
  initialOpen = false,
}: {
  name: string;
  tell: Instruction[];
  window: ObserverWindow;
  aiReady: boolean;
  prefs: Settings["observer"];
  pinned: ObstacleKey | null;
  lastWant?: string | null;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => {
    const show = () => setOpen(true);
    globalThis.addEventListener(OPEN, show);
    return () => globalThis.removeEventListener(OPEN, show);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    // Drop ?ritual=1 so a reload doesn't reopen it.
    const url = new URL(location.href);
    if (url.searchParams.has("ritual")) {
      url.searchParams.delete("ritual");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);
  return <Ritual open={open} onClose={close} name={name} tell={tell} window={win} aiReady={aiReady} prefs={prefs} pinned={pinned} lastWant={lastWant} />;
}

/** Opens the ritual. `text` renders a quiet underlined text button instead of the primary one. */
export function StepOutside({ children, variant = "primary", className }: { children: React.ReactNode; variant?: "primary" | "secondary" | "text"; className?: string }) {
  const open = () => globalThis.dispatchEvent(new Event(OPEN));
  if (variant === "text") {
    return (
      <button type="button" onClick={open} className={cn(textBtn, className)}>
        {children}
      </button>
    );
  }
  return (
    <Btn variant={variant} size="lg" onClick={open} className={className}>
      {children}
    </Btn>
  );
}
