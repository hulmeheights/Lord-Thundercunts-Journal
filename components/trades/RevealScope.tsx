"use client";

import { useEffect } from "react";

/**
 * Drives `.t-rv` (see Rise.tsx). Render it once inside the page: its effect
 * runs after the page has hydrated, so adding `.t-in` can never race React.
 * Picks up rows added later (filters, "earlier sessions") as they mount.
 */
export function RevealScope() {
  useEffect(() => {
    const pending = () => document.querySelectorAll<HTMLElement>(".t-rv:not(.t-in)");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const all = () => pending().forEach((el) => el.classList.add("t-in"));
      all();
      const mo = new MutationObserver(all);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("t-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );
    const scan = () => pending().forEach((el) => io.observe(el));
    scan();
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
