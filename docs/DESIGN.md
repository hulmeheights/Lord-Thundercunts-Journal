# Design system — "Meridian for a journal"

The owner's reference is their Meridian site: warm black, cream ink, a light serif for statements,
letter-spaced monospace for everything else, gold numbering, hairlines, a living line that never
stops moving. Every screen of this journal must feel like it belongs to that site. When in doubt,
**remove** something: white space is the luxury.

## Non-negotiables

1. **Colours (use the tokens, never hex in components):**
   - `bg` `#0A0A0B` warm void · `ink` `#ECE7DD` cream · `ink-2` `#A8A39A` · `ink-3` · `ink-4` `#5C5C63` mute
   - `line` hairline (9% cream) · `line-2` (16%)
   - `pos` `#74B89C` jade — gains, "live", completed things
   - `neg` = **cream** — losses are white like the owner's candles. Never red, never orange, never pink.
     Always pair a loss with a `−` sign (and ▼ where a direction glyph helps), so colour is never the only cue.
     (`data-loss="red"` swaps `neg` to clay `#C9806F` as an opt-in setting — components must just use `text-neg`.)
   - `gold` `#BD9E63` — section numbers, active markers, the ◆ diamond, featured borders. Sparingly.
   - **Forbidden:** purple, blue, cyan, indigo, yellow, orange, red, pink, gradients (except the living-line
     glow fill), drop shadows, glassmorphism, coloured icon tiles, emoji.
2. **Corners:** 0–3px. Pills only for 6px status dots.
3. **Type:**
   - Statements: `font-serif` (Fraunces) weight 300, tracking −0.01em. One word per headline in `<em>` (italic).
     Hero `text-[clamp(2.6rem,8.2vw,7rem)] leading-[1]`, section lead `text-[clamp(1.5rem,3.4vw,2.6rem)]`,
     row titles weight 400 `text-[clamp(1.3rem,2.8vw,2rem)]`.
   - Everything else: `font-mono` (JetBrains). Body 12px, `tracking-[0.04em]`, `leading-[1.9]`, `text-ink-2`, max ~40ch.
   - Labels: `.label` → `01 — WHAT YOU GET` (10px, 0.4em, uppercase, gold).
   - Eyebrows/meta: `.eyebrow` (10px, 0.28–0.42em, uppercase, `ink-4`).
   - Numbers: mono weight 300, tabular. Big stats `text-[clamp(2.4rem,5.6vw,4.6rem)]`; a unit/suffix in gold at 0.42em.
4. **Icons:** almost none. Prefer glyphs: `◆ → ↓ ← ● · ×`. A lucide icon only when nothing else works, 14px, `text-ink-4`.
5. **Motion:** one easing `cubic-bezier(0.16,1,0.3,1)`.
   - Scroll reveal: add `className="reveal"` (opacity 0, y 26px → in). Stagger with `style={{"--d": "80ms"}}`.
   - Rows indent `1.2rem` on hover. Primary buttons are magnetic (`data-magnetic`). Numbers count up / roll.
   - Something is always alive: the living line, the pulsing jade ● LIVE dot, the HUD clock.
   - Respect `prefers-reduced-motion`.

## Layout

- Pages are **vertical editorial scrolls of numbered sections**, not dashboards of boxes.
- `PageHead`: eyebrow line → serif title with one italic word → optional mono sub → right-aligned meta
  (like Meridian's HUD price), e.g. `+$2,284 / NET · 103 TRADES`.
- `Section`: `label` ("02 — The playbook") → optional serif lead → content. Sections are separated by
  generous space (`py-[clamp(4.5rem,11vh,9rem)]`), not boxes.
- `Row`: the core list pattern — grid `[auto 1fr 1.4fr]`, `border-t border-line`, index in gold mono,
  title in serif, description in mono. Hover indents. Mobile stacks.
- `Stats`: grid of 4 (2 on mobile) under a hairline. No card around them.
- `Panel`: the only boxed element (forms, the eval ledger, the "offer"-like summary). 1px `line` border,
  `rounded-[3px]`, `bg-surface`, padding `clamp(1.8rem,3vw,2.6rem)`. `gold` variant for the one featured panel per page.
- Forms: labels are eyebrows; inputs are `.field` (transparent, hairline, square). Toggles/segmented
  controls come from the kit.
- Charts: hairline axes, the jade glowing line, cream for drawdowns/losses. Bars are thin (2–6px):
  gains jade, losses cream/`ink-4`. No filled red/green blocks.

## Kit (`components/m/*`) — use these, don't reinvent

`PageHead`, `Section`, `Lead`, `Row`/`Rows`, `Stat`/`Stats`, `Num` (money with sign + tone),
`Panel`, `Tag`, `Seg` (segmented tabs), `Cue` (letter-spaced arrow link), `Btn`/`LinkBtn` (re-exported
buttons), `Manifesto` (word-by-word scroll reveal), `LimitLine` (dashed LIMIT with a probing line),
`Quote`, `LineChart`, `Bars`, `Empty`, `Dot` (live dot), `SectionIndex` (Meridian's right-side index).
Plus `LivingLine` (`components/charts/LivingLine.tsx`) and `Odometer` (`components/motion/Odometer.tsx`).

## Voice

Calm, precise, a little literary. Short serif statements ("The edge is everything you *don't* do.")
over mono detail. Never shout, never apologise. Empty states are confident ("No trades yet. Patience
is a position.").
