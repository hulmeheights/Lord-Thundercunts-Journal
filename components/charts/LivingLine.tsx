"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The living line: your real equity curve, never still. Every point breathes,
 * a live tape ticks along the tail, the colour drifts jade when the curve is
 * climbing and cream when it's falling, and the head pulses. Canvas, 60fps.
 */
export function LivingLine({ values, height = 150, className }: { values: number[]; height?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = values.map((v) => Math.round(v)).join(",");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, raf = 0, running = true;

    const base = values.length >= 2 ? values : [0, 0];
    const lo = Math.min(...base), hi = Math.max(...base);
    const span = hi - lo || 1;
    const norm = base.map((v) => ((v - lo) / span) * 2 - 1); // -1..1
    let pts: number[] = [];
    let drawn: number[] = [];
    let phases: number[] = [];
    let tape = 0, tapeV = 0;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const N = Math.max(40, Math.floor(W / 4));
      pts = Array.from({ length: N }, (_, i) => {
        const f = (i / (N - 1)) * (norm.length - 1);
        const a = Math.floor(f), b = Math.min(a + 1, norm.length - 1);
        return norm[a]! + (norm[b]! - norm[a]!) * (f - a);
      });
      drawn = reduced ? [...pts] : pts.map(() => 0);
      phases = pts.map((_, i) => i * 0.37 + Math.random() * 2);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (running = Boolean(e?.isIntersecting)));
    io.observe(canvas);

    const tint = { r: 0.92, g: 0.91, b: 0.87 };
    let pulse = 0;
    const start = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!running || document.hidden || !W) return;
      const t = (now - start) / 1000;
      const N = pts.length;
      // live tape: a calm mean-reverting tick on the tail
      tapeV += (Math.random() - 0.5) * 0.06;
      tapeV *= 0.9;
      tape = Math.max(-0.12, Math.min(0.12, tape + tapeV));
      for (let i = 0; i < N; i++) {
        const breathe = Math.sin(t * 0.9 + phases[i]!) * 0.035 + Math.sin(t * 0.37 + i * 0.11) * 0.025;
        const tail = i > N * 0.85 ? tape * ((i - N * 0.85) / (N * 0.15)) : 0;
        const target = pts[i]! + breathe + tail;
        drawn[i]! += (target - drawn[i]!) * (t < 2 ? 0.06 : 0.18);
      }
      const slope = drawn[N - 1]! - drawn[Math.max(0, N - 12)]!;
      const tg = slope >= 0 ? { r: 0.45, g: 0.72, b: 0.61 } : { r: 0.92, g: 0.91, b: 0.87 };
      tint.r += (tg.r - tint.r) * 0.03; tint.g += (tg.g - tint.g) * 0.03; tint.b += (tg.b - tint.b) * 0.03;
      draw();
    };

    const draw = () => {
      const N = pts.length;
      ctx.clearRect(0, 0, W, H);
      const cy = H * 0.5, amp = H * 0.38, sx = W / (N - 1);
      const col = `rgba(${Math.round(tint.r * 255)},${Math.round(tint.g * 255)},${Math.round(tint.b * 255)},`;
      const y0 = cy - (-1 * amp) * 0; // baseline = start of curve
      const baseY = cy - drawn[0]! * amp;
      ctx.strokeStyle = "rgba(236,231,221,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke();
      void y0;
      ctx.beginPath();
      ctx.moveTo(0, cy - drawn[0]! * amp);
      for (let i = 1; i < N; i++) ctx.lineTo(i * sx, cy - drawn[i]! * amp);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, col + "0.10)"); g.addColorStop(1, col + "0)");
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 14; ctx.shadowColor = col + "0.5)";
      ctx.strokeStyle = col + "0.92)"; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, cy - drawn[0]! * amp);
      for (let i = 1; i < N; i++) ctx.lineTo(i * sx, cy - drawn[i]! * amp);
      ctx.stroke();
      ctx.shadowBlur = 0;
      pulse += 0.05;
      const dy = cy - drawn[N - 1]! * amp, rr = 2.6 + Math.sin(pulse) * 0.8;
      ctx.beginPath(); ctx.arc(W - 3, dy, rr + 5, 0, Math.PI * 2); ctx.fillStyle = col + "0.12)"; ctx.fill();
      ctx.beginPath(); ctx.arc(W - 3, dy, rr, 0, Math.PI * 2); ctx.fillStyle = col + "1)"; ctx.fill();
    };

    if (reduced) draw();
    else raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <canvas ref={ref} aria-hidden className={className} style={{ display: "block", width: "100%", height }} />;
}
