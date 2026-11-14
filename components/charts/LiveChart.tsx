"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

export type ChartTone = "pos" | "ink" | "gold" | "mute";
export type ChartLevel = { value: number; label?: string; tone?: ChartTone; dashed?: boolean };
export type ChartMark = { index: number; label: string; tone?: ChartTone };
export type ChartEnd = { value: number; label: string; tone?: ChartTone };

const FALLBACK: Record<string, string> = { "--ink": "236,231,221", "--pos": "116,184,156", "--gold": "189,158,99", "--ink-4": "92,92,99" };

/** "#74b89c" → "116,184,156", so canvas colours follow the theme tokens. */
function token(el: Element, name: string): string {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)?.[1];
  if (!hex) return FALLBACK[name] ?? "236,231,221";
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(",");
}

const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * The line, drawn from real numbers. It travels left to right from the first
 * point to now (the figure riding the tip), reshapes itself when the numbers
 * change, and afterwards stays alive with a pulse at the head and a glint that
 * runs the route again. Scrub it to read any day.
 *
 * `floor` is a stepped limit under the line (the trailing max loss); the band
 * between the two is shaded. `ends` are labels in a right-hand gutter, and
 * `gap` brackets the distance from the head to the floor.
 */
export function LiveChart({
  values,
  floor,
  levels = [],
  marks = [],
  ends = [],
  gap,
  headLabels,
  readout,
  tone = "auto",
  seenIndex,
  gutter = 0,
  delay = 0,
  height = 170,
  className,
  label,
  onDone,
}: {
  values: number[];
  floor?: number[];
  levels?: ChartLevel[];
  marks?: ChartMark[];
  ends?: ChartEnd[];
  /** Text for the bracket between the head and the floor. */
  gap?: string;
  /** The figure that rides the tip, one per point. */
  headLabels?: string[];
  /** What scrubbing shows, one per point. */
  readout?: string[];
  tone?: ChartTone | "auto";
  /** The last point already seen: the line arrives there quickly, then draws what is new. */
  seenIndex?: number;
  gutter?: number;
  delay?: number;
  height?: number;
  className?: string;
  label?: string;
  onDone?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  /** The last shape on screen, as fractions of the height, so new numbers morph in. */
  const last = useRef<number[] | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const key = JSON.stringify([values.map(Math.round), floor?.map(Math.round), levels, marks, ends, gap, headLabels, tone, seenIndex, gutter]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const font = getComputedStyle(canvas).fontFamily || "ui-monospace, monospace";
    const rgb = { ink: token(canvas, "--ink"), pos: token(canvas, "--pos"), gold: token(canvas, "--gold"), mute: token(canvas, "--ink-4") };

    const vals = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
    const n = vals.length;
    const fl = floor && floor.length === n ? floor : null;
    const all = [...vals, ...(fl ?? []), ...levels.map((l) => l.value), ...ends.map((e) => e.value)];
    const lo = Math.min(...all), hi = Math.max(...all);
    const span = hi - lo || 1;
    const auto: ChartTone = vals[n - 1]! >= vals[0]! ? "pos" : "ink";
    const main = rgb[tone === "auto" ? auto : tone];

    const PT = 26, PB = 12;
    let W = 0, H = 0, PW = 0, G = 0, R = 0;
    let goal: number[] = [];
    let from: number[] | null = null;
    let cur: number[] = [];
    const Y = (v: number) => PT + (1 - (v - lo) / span) * (H - PT - PB);
    const X = (i: number) => (i / (n - 1)) * PW;

    const resample = (src: number[], len: number) =>
      Array.from({ length: len }, (_, k) => {
        const f = (k / (len - 1)) * (src.length - 1);
        const a = Math.floor(f), b = Math.min(a + 1, src.length - 1);
        return src[a]! + (src[b]! - src[a]!) * (f - a);
      });

    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      G = gutter ? Math.min(gutter, W * 0.38) : 0;
      PW = W - G - 6;
      R = Math.max(n, Math.min(700, Math.round(PW / 3)));
      goal = resample(vals.map(Y), R);
      from = last.current ? resample(last.current, R).map((f) => f * H) : null;
      cur = [...goal];
    };
    size();

    const morphing = Boolean(last.current);
    const seen = !morphing && seenIndex !== undefined && seenIndex > 0 && seenIndex < n - 1 ? seenIndex / (n - 1) : null;
    let t0 = 0, p = reduced || morphing ? 1 : 0, m = reduced || !morphing ? 1 : 0, finished = false;
    let visible = false, raf = 0, hover: number | null = null;

    /** How far along the route the tip is, 0..1. */
    const progress = (ms: number) => {
      if (seen === null) return inOut(clamp01(ms / 2300));
      if (ms < 900) return seen * out(ms / 900);
      if (ms < 1300) return seen;
      return seen + (1 - seen) * inOut(clamp01((ms - 1300) / 1900));
    };
    const at = (x: number) => {
      const f = clamp01(x / PW) * (R - 1);
      const a = Math.floor(f), b = Math.min(a + 1, R - 1);
      return cur[a]! + (cur[b]! - cur[a]!) * (f - a);
    };
    const text = (s: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") => {
      ctx.font = `9px ${font}`;
      if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = W < 520 ? "0.7px" : "1.4px";
      ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillStyle = color;
      ctx.fillText(s.toUpperCase(), x, y);
    };
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(0, cur[0]!);
      for (let k = 1; k < R; k++) ctx.lineTo((k / (R - 1)) * PW, cur[k]!);
    };
    const steps = (to: number) => {
      ctx.moveTo(0, Y(fl![0]!));
      for (let i = 1; i < n; i++) { ctx.lineTo(X(i), Y(fl![i - 1]!)); ctx.lineTo(X(i), Y(fl![i]!)); }
      ctx.lineTo(to, Y(fl![n - 1]!));
    };

    const draw = (now: number) => {
      if (!W || !H) return;
      const settle = finished ? 1 : 0;
      ctx.clearRect(0, 0, W, H);
      const tip = p * PW;

      for (const l of levels) {
        const y = Math.round(Y(l.value)) + 0.5;
        const c = rgb[l.tone ?? "ink"];
        ctx.setLineDash(l.dashed ? [2, 5] : []);
        ctx.strokeStyle = `rgba(${c},${l.tone === "gold" ? 0.42 : 0.12})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PW, y); ctx.stroke();
        ctx.setLineDash([]);
        if (l.label) text(l.label, 1, y - 9, `rgba(${c},${l.tone === "gold" ? 0.85 : 0.42})`);
      }

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, tip + 1, H); ctx.clip();
      // The fill: down to the floor when there is one (the cushion), else to the foot.
      ctx.save();
      if (fl) { ctx.beginPath(); steps(PW); ctx.lineTo(PW, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.clip(); }
      trace(); ctx.lineTo(PW, H); ctx.lineTo(0, H); ctx.closePath();
      const g = ctx.createLinearGradient(0, PT, 0, H);
      g.addColorStop(0, `rgba(${main},${fl ? 0.13 : 0.1})`); g.addColorStop(1, `rgba(${main},${fl ? 0.03 : 0})`);
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      if (fl) {
        ctx.setLineDash([5, 6]); ctx.strokeStyle = `rgba(${rgb.ink},0.55)`; ctx.lineWidth = 1;
        ctx.beginPath(); steps(PW); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.shadowBlur = 14; ctx.shadowColor = `rgba(${main},0.5)`;
      ctx.strokeStyle = `rgba(${main},0.95)`; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.lineCap = "round";
      trace(); ctx.stroke();
      ctx.shadowBlur = 0;
      // The glint: every few seconds a light runs the route from the start to now.
      if (finished && !reduced && hover === null) {
        const c = ((now - t0) % 7000) / 2200;
        if (c < 1) {
          const gx = inOut(c) * (PW + 160) - 80;
          const sweep = ctx.createLinearGradient(gx - 80, 0, gx + 80, 0);
          sweep.addColorStop(0, `rgba(${rgb.ink},0)`); sweep.addColorStop(0.5, `rgba(${rgb.ink},0.9)`); sweep.addColorStop(1, `rgba(${rgb.ink},0)`);
          ctx.strokeStyle = sweep; ctx.lineWidth = 2.2;
          trace(); ctx.stroke();
        }
      }
      ctx.restore();

      for (const k of marks) {
        const x = X(k.index);
        if (x > tip + 0.5) continue;
        const y = at(x), c = rgb[k.tone ?? "ink"];
        const up = y - 22 > 10;
        ctx.strokeStyle = `rgba(${c},0.55)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 0.5, y + (up ? -5 : 5)); ctx.lineTo(x + 0.5, y + (up ? -13 : 13)); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c},1)`; ctx.fill();
        const edge = x < 60 ? "left" : x > PW - 60 ? "right" : "center";
        text(k.label, x, y + (up ? -20 : 20), `rgba(${c},0.9)`, edge);
      }

      // The head: a dot, a ring that keeps pinging, and the figure riding it.
      const hy = at(tip);
      if (!reduced && finished) {
        const ping = ((now - t0) % 2600) / 2600;
        ctx.beginPath(); ctx.arc(tip, hy, 3 + ping * 13, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${main},${0.45 * (1 - ping)})`; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(tip, hy, 7, 0, Math.PI * 2); ctx.fillStyle = `rgba(${main},0.14)`; ctx.fill();
      ctx.beginPath(); ctx.arc(tip, hy, 3, 0, Math.PI * 2); ctx.fillStyle = `rgba(${main},1)`; ctx.fill();
      if (headLabels && hover === null) {
        const s = headLabels[Math.round(p * (n - 1))];
        if (s) text(s, tip < 90 ? tip + 10 : tip + 2, hy - 14 > 8 ? hy - 14 : hy + 16, `rgba(${rgb.ink},0.92)`, tip < 90 ? "left" : "right");
      }

      // The gutter: each line named where it ends, and the gap between them.
      if (G && settle) {
        const rows = ends.map((e) => ({ ...e, y: Y(e.value), at: Y(e.value) })).sort((a, b) => a.y - b.y);
        for (let i = 1; i < rows.length; i++) rows[i]!.y = Math.max(rows[i]!.y, rows[i - 1]!.y + 13);
        const over = rows.length ? rows[rows.length - 1]!.y - (H - 6) : 0;
        if (over > 0) for (const r of rows) r.y -= over;
        for (const r of rows) text(r.label, PW + 14, r.y, `rgba(${rgb[r.tone ?? "ink"]},0.92)`);
        if (gap && fl) {
          const a = hy, b = Y(fl[n - 1]!), x = PW + 0.5;
          if (Math.abs(b - a) > 9) {
            ctx.strokeStyle = `rgba(${rgb.ink},0.5)`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, Math.min(a, b) + 6); ctx.lineTo(x, Math.max(a, b) - 3); ctx.stroke();
          }
          if (rows.length === 2 && rows[1]!.y - rows[0]!.y >= 30) text(`↕ ${gap}`, PW + 14, (rows[0]!.y + rows[1]!.y) / 2, `rgba(${rgb.mute},1)`);
        }
      }

      if (hover !== null) {
        const x = X(hover), y = Y(vals[hover]!);
        ctx.strokeStyle = `rgba(${rgb.ink},0.22)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 16); ctx.lineTo(Math.round(x) + 0.5, H); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fillStyle = `rgba(${rgb.ink},1)`; ctx.fill();
        const s = readout?.[hover];
        if (s) {
          ctx.font = `9px ${font}`;
          const w = ctx.measureText(s.toUpperCase()).width + s.length * 1.4;
          ctx.fillStyle = `rgba(${token(canvas, "--bg")},0.9)`;
          const left = Math.max(0, Math.min(W - w - 8, x - w / 2));
          ctx.fillRect(left - 4, 0, w + 12, 15);
          text(s, left, 7, `rgba(${rgb.ink},0.95)`);
        }
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (!t0) t0 = now + delay;
      const ms = now - t0;
      if (ms < 0) return;
      if (morphing) {
        m = out(clamp01(ms / 1000));
        if (from) for (let k = 0; k < R; k++) cur[k] = from[k]! + (goal[k]! - from[k]!) * m;
      } else p = progress(ms);
      if (!finished && (morphing ? m >= 1 : p >= 1)) {
        finished = true;
        cur = [...goal];
        done.current?.();
      }
      draw(now);
    };

    const ro = new ResizeObserver(() => { size(); if (reduced) draw(0); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = Boolean(e?.isIntersecting)), { threshold: 0.15 });
    io.observe(canvas);

    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      hover = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / PW) * (n - 1))));
      if (X(hover) > p * PW) hover = null;
      if (reduced) draw(0);
    };
    const leave = () => { hover = null; if (reduced) draw(0); };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointercancel", leave);

    if (reduced) { finished = true; draw(0); done.current?.(); }
    else raf = requestAnimationFrame(frame);
    return () => {
      if (H) last.current = cur.map((y) => y / H);
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <canvas
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`font-mono ${className ?? ""}`}
      style={{ display: "block", width: "100%", height, touchAction: "pan-y" }}
    />
  );
}
