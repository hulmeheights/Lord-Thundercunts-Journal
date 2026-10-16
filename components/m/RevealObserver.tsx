"use client";

import { useEffect } from "react";

/**
 * One observer for the whole app: any element with `.reveal` rises in when it
 * scrolls into view (including elements added after navigation).
 */
/** React tags DOM nodes it owns once they hydrate; touching className before that breaks hydration. */
const hydrated = (el: Element) =>
  Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

export function RevealObserver() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return; // the stylesheet already shows every .reveal
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.unobserve(e.target);
            show(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );
    // React rewrites className when a prop changes; put `.in` back on things already shown.
    const shown = new WeakSet<Element>();
    let timers: ReturnType<typeof setTimeout>[] = [];
    // Streamed sections can be on screen before React hydrates them: wait for it.
    const show = (el: Element, tries = 0) => {
      if (hydrated(el) || tries > 60) {
        shown.add(el);
        el.classList.add("in");
      } else timers.push(setTimeout(() => show(el, tries + 1), 50));
    };
    const scan = (root: ParentNode) =>
      root.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    scan(document);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") {
          const t = m.target as Element;
          if (shown.has(t) && !t.classList.contains("in"))
            t.classList.add("in");
          continue;
        }
        m.addedNodes.forEach(
          (n) =>
            n instanceof Element &&
            (n.matches(".reveal:not(.in)") ? io.observe(n) : scan(n)),
        );
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      timers = [];
      mo.disconnect();
    };
  }, []);
  return null;
}
