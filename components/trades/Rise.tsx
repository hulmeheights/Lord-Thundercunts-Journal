/**
 * Entrances for the trades screens, built to be hydration-safe.
 *
 * The app-wide `.reveal` is driven by a root-level observer that can add `.in`
 * before this route's Suspense boundary hydrates (on first load, and on any
 * reload that restores a scroll position), which React reports as a className
 * mismatch. So these screens never server-render `.reveal`:
 *
 *  - `.t-rise` — things visible on first paint rise with a pure CSS keyframe:
 *    same distance, duration and easing as `.reveal`, no class changes at all.
 *  - `.t-rv` — the scroll reveal. `<RevealScope />` (rendered inside the page,
 *    so its effect only runs once the page has hydrated) adds `.t-in` as each
 *    one scrolls into view. Keep `.t-rv` classNames static.
 *  - `.t-drawn` — the trigger for drawn-in figures (PriceTrace); an ancestor
 *    gets it from React after mount, never from outside.
 *
 * Stagger any of them with `style={d(80)}`.
 */
const CSS = `
.t-rise{animation:t-rise 1s cubic-bezier(0.16,1,0.3,1) var(--d,0ms) both}
@keyframes t-rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
.t-rv{opacity:0;transform:translateY(26px);transition:opacity 1s cubic-bezier(0.16,1,0.3,1) var(--d,0ms),transform 1s cubic-bezier(0.16,1,0.3,1) var(--d,0ms)}
.t-rv.t-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.t-rise{animation:none}.t-rv{opacity:1;transform:none;transition:none}}
`;

export function RiseStyle() {
  return (
    <style href="ltj-trades-rise" precedence="default">
      {CSS}
    </style>
  );
}

/** `style` for a staggered `.t-rise` / `.t-rv`. */
export const d = (ms?: number) => (ms ? ({ "--d": `${ms}ms` } as React.CSSProperties) : undefined);
