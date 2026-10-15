"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Instruction } from "@/lib/analytics/observer";
import type { ObserverWindow } from "@/lib/data/observer";
import type { Settings } from "@/lib/types";
import { Btn } from "@/components/m";
import { cn } from "@/lib/cn";
import { Ritual } from "./Ritual";
import { textBtn } from "./ui";

const RitualCtx = createContext<(() => void) | null>(null);

/**
 * Holds the "Step outside" ritual for the whole page, so any button on it can
 * open the same full-screen sequence. `?ritual=1` opens it on arrival.
 */
export function ObserverShell({
  children,
  name,
  tell,
  window: win,
  aiReady,
  prefs,
  initialOpen = false,
}: {
  children: React.ReactNode;
  name: string;
  tell: Instruction[];
  window: ObserverWindow;
  aiReady: boolean;
  prefs: Settings["observer"];
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    setOpen(false);
    // Drop ?ritual=1 so a reload doesn't reopen it.
    const url = new URL(location.href);
    if (url.searchParams.has("ritual")) {
      url.searchParams.delete("ritual");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);
  return (
    <RitualCtx.Provider value={show}>
      {children}
      <Ritual open={open} onClose={close} name={name} tell={tell} window={win} aiReady={aiReady} prefs={prefs} />
    </RitualCtx.Provider>
  );
}

/** Opens the ritual. `text` renders a quiet underlined text button instead of the primary one. */
export function StepOutside({ children, variant = "primary", className }: { children: React.ReactNode; variant?: "primary" | "secondary" | "text"; className?: string }) {
  const open = useContext(RitualCtx);
  if (variant === "text") {
    return (
      <button type="button" onClick={() => open?.()} className={cn(textBtn, className)}>
        {children}
      </button>
    );
  }
  return (
    <Btn variant={variant} size="lg" onClick={() => open?.()} className={className}>
      {children}
    </Btn>
  );
}
