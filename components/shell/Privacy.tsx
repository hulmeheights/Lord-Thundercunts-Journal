"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { readUiPrefs, writeUiPrefs } from "@/lib/ui-prefs-client";

/** Money, prices, P&L and percentages wherever they appear in running text. */
const SENSITIVE = /\$\s?\d|\d[\d,]*\.\d{2}\b|\d{1,3}(?:,\d{3})+|\d\s?%|\d+(?:\.\d+)?\s?R\b/;
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "TITLE"]);

/** React tags DOM nodes it owns once they hydrate; adding a class before that breaks hydration. */
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
const waiting = new Set<Element>();
let retry: ReturnType<typeof setTimeout> | null = null;

function flag(el: Element) {
  if (hydrated(el)) el.classList.add("pv");
  else {
    waiting.add(el);
    retry ??= setTimeout(() => {
      retry = null;
      const again = [...waiting];
      waiting.clear();
      if (document.documentElement.dataset.privacy === "on") again.forEach(flag);
    }, 120);
  }
}

function mark(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || SKIP.has(el.tagName) || el.closest("[data-public]")) continue;
    if (SENSITIVE.test(n.nodeValue ?? "") && !el.classList.contains("pv")) flag(el);
  }
}
function unmark() {
  waiting.clear();
  document.querySelectorAll(".pv").forEach((el) => el.classList.remove("pv"));
}

/**
 * Keeps the blur on while privacy is on: marks text that holds figures, and
 * re-marks anything React re-renders or adds. Only adds a class; never touches
 * the text itself, so it can't break the page.
 */
export function PrivacyScan() {
  useEffect(() => {
    let mo: MutationObserver | null = null;
    let raf = 0;
    const start = () => {
      mark(document.body);
      // The page stays veiled until the first scan has had a moment to catch prose figures.
      setTimeout(() => (document.documentElement.dataset.pvReady = "1"), 250);
      mo = new MutationObserver((muts) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          for (const m of muts) {
            if (m.type === "characterData") mark(m.target.parentNode ?? document.body);
            else if (m.type === "childList") m.addedNodes.forEach((a) => mark(a));
            else if (m.type === "attributes") mark(m.target);
          }
        });
      });
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    };
    const stop = () => {
      mo?.disconnect();
      mo = null;
      unmark();
    };
    const sync = () => (document.documentElement.dataset.privacy === "on" ? (mo ? mark(document.body) : start()) : stop());
    sync();
    window.addEventListener("ltj:privacy", sync);
    return () => {
      window.removeEventListener("ltj:privacy", sync);
      cancelAnimationFrame(raf);
      mo?.disconnect();
    };
  }, []);
  return null;
}

/** The eye. On: every figure and chart blurs, and stays blurred across pages and reloads. */
export function PrivacyToggle({ className, label = true }: { className?: string; label?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(document.documentElement.dataset.privacy === "on");
    read();
    window.addEventListener("ltj:privacy", read);
    return () => window.removeEventListener("ltj:privacy", read);
  }, []);
  const Icon = on ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={() => writeUiPrefs({ ...readUiPrefs(), privacy: !on })}
      aria-pressed={on}
      aria-label={on ? "Show figures" : "Hide figures"}
      title={on ? "Show figures" : "Hide figures (for showing someone)"}
      data-public
      className={cn("inline-flex items-center gap-2.5 font-mono uppercase transition-colors duration-300", on ? "text-gold" : "text-ink-4 hover:text-ink-2", className)}
    >
      <Icon size={14} strokeWidth={1.4} />
      {label && <span>{on ? "Hidden" : "Hide figures"}</span>}
    </button>
  );
}
