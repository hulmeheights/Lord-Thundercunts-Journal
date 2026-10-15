"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The hero equity curve: a glowing emerald ribbon rendered in WebGL with soft
 * additive bloom, a little depth, and a breathing glow. Stretches below the
 * running peak (drawdowns) cool into the loss colour. Falls back to an SVG
 * line when WebGL isn't available, and renders a single still frame for
 * reduced motion. Rendering pauses whenever it's off-screen.
 */
export function EquityRibbon({
  values,
  className,
  drawDelay = 0.25,
}: {
  values: number[];
  className?: string;
  drawDelay?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [webgl, setWebgl] = useState(false);
  const series = values.length >= 2 ? values : [0, values[0] ?? 0];
  const key = series.map((v) => Math.round(v)).join(",");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let teardown = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        return; // keep the SVG fallback
      }
      const reduced = prefersReducedMotion();
      const styles = getComputedStyle(host);
      const lossColor = new THREE.Color(styles.getPropertyValue("--neg").trim() || "#ffffff");
      const upColor = new THREE.Color("#3ddc97");
      const deepColor = new THREE.Color("#0e7a4f");

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.inset = "0";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      host.appendChild(renderer.domElement);
      setWebgl(true);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      camera.position.set(0, 0.05, 4.2);
      const group = new THREE.Group();
      scene.add(group);

      const SEGS = 420;
      const RADIAL = 10;
      let tubes: { mesh: InstanceType<typeof THREE.Mesh>; base: number }[] = [];
      let area: InstanceType<typeof THREE.Mesh> | null = null;
      let grid: InstanceType<typeof THREE.LineSegments> | null = null;
      let head: InstanceType<typeof THREE.Sprite> | null = null;
      let headPos = new THREE.Vector3();
      let curveLen = 0;

      // Soft round glow texture for the "live" head.
      const glowTex = (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d")!;
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.18, "rgba(61,220,151,0.9)");
        grad.addColorStop(0.5, "rgba(61,220,151,0.18)");
        grad.addColorStop(1, "rgba(61,220,151,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();

      const clear = () => {
        for (const t of tubes) {
          group.remove(t.mesh);
          t.mesh.geometry.dispose();
          (t.mesh.material as InstanceType<typeof THREE.Material>).dispose();
        }
        tubes = [];
        for (const o of [area, grid, head]) {
          if (!o) continue;
          group.remove(o);
          if ("geometry" in o && o.geometry) (o.geometry as InstanceType<typeof THREE.BufferGeometry>).dispose();
          (o.material as InstanceType<typeof THREE.Material>).dispose();
        }
        area = grid = head = null;
      };

      const build = (aspect: number) => {
        clear();
        const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const visW = visH * aspect;
        const W = visW * 0.94;
        const lo = Math.min(...series);
        const hi = Math.max(...series);
        const span = hi - lo || 1;
        const yTop = visH * 0.3;
        const yBot = -visH * 0.3;
        const n = series.length;

        const pts = series.map((v, i) => {
          const t = i / (n - 1);
          const x = -W / 2 + t * W;
          const y = yBot + ((v - lo) / span) * (yTop - yBot);
          const z = 0.22 * Math.sin(t * Math.PI * 1.15 + 0.4) - 0.1;
          return new THREE.Vector3(x, y, z);
        });
        const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
        curveLen = curve.getLength();

        // Drawdown factor per position along the curve (0 = at a new high).
        let peak = -Infinity;
        const dd = series.map((v) => {
          peak = Math.max(peak, v);
          return Math.min(1, Math.max(0, (peak - v) / (span * 0.18)));
        });
        const ddAt = (t: number) => {
          const f = t * (n - 1);
          const i = Math.floor(f);
          const a = dd[Math.min(i, n - 1)]!;
          const b = dd[Math.min(i + 1, n - 1)]!;
          return a + (b - a) * (f - i);
        };

        const tube = (radius: number, opacity: number, coreBoost: number) => {
          const geo = new THREE.TubeGeometry(curve, SEGS, radius, RADIAL, false);
          const colors = new Float32Array(geo.attributes.position!.count * 3);
          const c = new THREE.Color();
          for (let i = 0; i <= SEGS; i++) {
            const t = i / SEGS;
            c.copy(upColor).lerp(lossColor, ddAt(t));
            if (coreBoost) c.lerp(new THREE.Color("#ffffff"), coreBoost * (1 - ddAt(t)) * 0.35);
            for (let j = 0; j <= RADIAL; j++) {
              const k = (i * (RADIAL + 1) + j) * 3;
              colors[k] = c.r;
              colors[k + 1] = c.g;
              colors[k + 2] = c.b;
            }
          }
          geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geo, mat);
          group.add(mesh);
          tubes.push({ mesh, base: opacity });
        };
        tube(0.075, 0.06, 0);
        tube(0.024, 0.26, 0);
        tube(0.0065, 1, 1);

        // Gradient fill under the ribbon.
        const SAMPLES = 220;
        const pos = new Float32Array((SAMPLES + 1) * 2 * 3);
        const alpha = new Float32Array((SAMPLES + 1) * 2);
        const floor = yBot - visH * 0.22;
        for (let i = 0; i <= SAMPLES; i++) {
          const p = curve.getPoint(i / SAMPLES);
          pos.set([p.x, p.y, p.z - 0.001], i * 6);
          pos.set([p.x, floor, p.z - 0.001], i * 6 + 3);
          alpha[i * 2] = 0.2 * (1 - ddAt(i / SAMPLES) * 0.6);
          alpha[i * 2 + 1] = 0;
        }
        const idx: number[] = [];
        for (let i = 0; i < SAMPLES; i++) {
          const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
          idx.push(a, b, c2, b, d, c2);
        }
        const ag = new THREE.BufferGeometry();
        ag.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        ag.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
        ag.setIndex(idx);
        area = new THREE.Mesh(
          ag,
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: { uColor: { value: deepColor.clone().lerp(upColor, 0.55) }, uBreath: { value: 1 } },
            vertexShader: "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
            fragmentShader: "uniform vec3 uColor; uniform float uBreath; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uBreath); }",
          }),
        );
        group.add(area);

        // Quiet terminal grid.
        const lines: number[] = [];
        for (let k = 0; k <= 4; k++) {
          const y = yBot + ((yTop - yBot) * k) / 4;
          lines.push(-visW / 2, y, -0.35, visW / 2, y, -0.35);
        }
        const gg = new THREE.BufferGeometry();
        gg.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
        grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 }));
        group.add(grid);

        // The living head of the curve.
        head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        headPos = pts[pts.length - 1]!.clone();
        head.position.copy(headPos);
        head.scale.setScalar(0.22);
        group.add(head);
      };

      let width = 0, height = 0;
      const resize = () => {
        const r = host.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        if (Math.abs(r.width - width) < 1 && Math.abs(r.height - height) < 1) return;
        width = r.width;
        height = r.height;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        build(camera.aspect);
        if (reduced) setProgress(1);
        renderer.render(scene, camera);
      };

      const setProgress = (p: number) => {
        const seg = Math.max(1, Math.floor(p * SEGS));
        for (const t of tubes) t.mesh.geometry.setDrawRange(0, seg * RADIAL * 6);
        if (area) area.geometry.setDrawRange(0, Math.floor(p * 220) * 6);
        if (head) {
          head.visible = p >= 0.995;
        }
      };

      const ro = new ResizeObserver(resize);
      ro.observe(host);
      resize();

      let visible = true;
      const io = new IntersectionObserver(([e]) => {
        visible = Boolean(e?.isIntersecting);
      });
      io.observe(host);

      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const onPointer = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      let raf = 0;
      const start = performance.now();
      const DRAW = 1.9;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (!visible || document.hidden) return;
        const t = (now - start) / 1000;
        const p = Math.min(1, Math.max(0, (t - drawDelay) / DRAW));
        const eased = 1 - Math.pow(1 - p, 3.2);
        setProgress(eased);
        const breath = 0.86 + 0.14 * Math.sin(t * 0.9);
        for (const tb of tubes) (tb.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = tb.base * (tb.base < 1 ? breath : 1);
        if (area) (area.material as InstanceType<typeof THREE.ShaderMaterial>).uniforms.uBreath!.value = 0.85 + 0.15 * Math.sin(t * 0.9);
        if (head) head.scale.setScalar(0.2 + 0.05 * Math.sin(t * 2.2));
        pointer.x += (pointer.tx - pointer.x) * 0.04;
        pointer.y += (pointer.ty - pointer.y) * 0.04;
        camera.position.x = pointer.x * 0.12;
        camera.position.y = 0.05 - pointer.y * 0.06;
        camera.lookAt(0, -0.15, 0);
        group.rotation.y = Math.sin(t * 0.12) * 0.035;
        renderer.render(scene, camera);
      };
      if (reduced) {
        setProgress(1);
        camera.lookAt(0, -0.15, 0);
        renderer.render(scene, camera);
      } else {
        raf = requestAnimationFrame(loop);
      }

      teardown = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onPointer);
        clear();
        glowTex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      void curveLen;
    });

    return () => {
      disposed = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, drawDelay]);

  // SVG fallback (and the pre-WebGL first paint).
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const d = series
    .map((v, i) => `${i ? "L" : "M"}${((i / (series.length - 1)) * 1000).toFixed(1)},${(380 - ((v - lo) / span) * 220).toFixed(1)}`)
    .join(" ");

  return (
    <div ref={hostRef} aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {!webgl && (
        <svg viewBox="0 0 1000 500" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-80">
          <defs>
            <filter id="ribbon-glow" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <path d={d} fill="none" stroke="#3ddc97" strokeWidth="8" opacity="0.35" filter="url(#ribbon-glow)" vectorEffect="non-scaling-stroke" />
          <path d={d} fill="none" stroke="#3ddc97" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
