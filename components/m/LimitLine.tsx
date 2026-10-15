"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Meridian's "the line": a dashed LIMIT and a living line probing towards it.
 * `closeness` 0..1 is how near you are to the limit (0 = far, 1 = touching);
 * the line warms from jade towards gold/cream as it closes in.
 */
export function LimitLine({ closeness, label = "LIMIT", height = 90, className }: { closeness: number; label?: string; height?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = prefersReducedMotion();
    let w = 0, h = 0, raf = 0, ph = 0, cross = 0;
    const target = Math.max(0, Math.min(1, closeness));
    const size = () => {
      const r = c.getBoundingClientRect();
      w = r.width; h = r.height;
      c.width = Math.max(1, Math.floor(w * dpr)); c.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    let seen = false;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) seen = true; });
    io.observe(c);
    const draw = () => {
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      const cy = h * 0.32;
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = `rgba(236,231,221,${0.25 + cross * 0.45})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
      ctx.setLineDash([]);
      const probe = cy + (1 - cross) * h * 0.5 - Math.sin(ph) * h * 0.05 * (1 - cross) + 2;
      const r = Math.round((0.45 + cross * 0.29) * 255), g = Math.round((0.72 - cross * 0.1) * 255), b = Math.round((0.61 - cross * 0.22) * 255);
      const col = `rgba(${r},${g},${b},`;
      ctx.shadowBlur = 12; ctx.shadowColor = col + "0.5)";
      ctx.strokeStyle = col + "0.95)"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const yy = h * 0.92 - (h * 0.92 - probe) * (x / w) + Math.sin(x * 0.03 + ph) * 4 * (1 - cross);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(w - 3, probe, 3, 0, Math.PI * 2); ctx.fillStyle = col + "1)"; ctx.fill();
      ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = `rgba(236,231,221,${0.4 + cross * 0.45})`;
      ctx.fillText(label, 2, cy - 7);
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (seen) cross += (target - cross) * 0.02;
      ph += 0.018;
      draw();
    };
    if (reduced) { cross = target; draw(); } else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [closeness, label]);
  return <canvas ref={ref} aria-hidden className={className} style={{ display: "block", width: "100%", height }} />;
}
