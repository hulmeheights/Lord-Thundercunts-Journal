/**
 * The mission scene: where the rocket is, the worlds (goals) it has passed and
 * the ones ahead, and the destination it's flying to. Deterministic (seeded by
 * the goal ids), so the picture only ever changes when you do.
 */

export type Stage = { id: string; done: boolean };
export type World = { id: string; x: number; y: number; r: number; done: boolean };
export type Dust = { x: number; y: number; r: number };
export type Flight = {
  width: number;
  height: number;
  ground: number;
  rocket: { x: number; y: number };
  trail: string;
  worlds: World[];
  destination: { x: number; y: number; r: number };
  /** Three layers of stars, nearest last, for the parallax drift. */
  layers: Dust[][];
};

const W = 400;
const H = 520;
const GROUND = 494;

/** A stable 0–1 number from a string. */
function rand(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export function growFlight(stages: Stage[], altitude: number): Flight {
  const reached = stages.filter((s) => s.done);
  const open = stages.filter((s) => !s.done);
  const progress = stages.length ? reached.length / stages.length : 0;
  // Climbs quickly at first and keeps climbing, never past the destination.
  const lift = 300 * (1 - Math.exp(-Math.max(0, altitude) / 60));
  const rocket = { x: W / 2, y: r1(GROUND - 46 - lift) };
  const destination = { x: 296, y: 74, r: r1(16 + 30 * progress) };
  const worlds: World[] = [
    ...reached.map((s, i) => ({
      id: s.id,
      done: true,
      x: r1(W / 2 + (i % 2 ? 1 : -1) * (64 + rand(s.id, 5) * 80)),
      y: r1(GROUND - 40 - ((GROUND - 40 - (rocket.y + 40)) * (i + 1)) / (reached.length + 1)),
      r: r1(7 + rand(s.id, 6) * 6),
    })),
    ...open.slice(0, 5).map((s, i) => ({
      id: s.id,
      done: false,
      x: r1(W / 2 + (i % 2 ? -1 : 1) * (52 + i * 22)),
      y: r1(Math.max(destination.y + destination.r + 22, rocket.y - 54 - i * 34)),
      r: r1(5 + rand(s.id, 7) * 3),
    })),
  ];
  const trail = `M${W / 2} ${GROUND} C${W / 2 - 24} ${r1(GROUND - lift * 0.35)} ${W / 2 + 18} ${r1(GROUND - lift * 0.7)} ${rocket.x} ${r1(rocket.y + 34)}`;
  const layers = [70, 40, 18].map((n, L) =>
    Array.from({ length: n }, (_, i) => ({ x: r1(rand(`sky${L}`, i) * W), y: r1(rand(`sky${L}`, 500 + i) * H), r: r1(0.35 + L * 0.35 + rand(`sky${L}`, 900 + i) * 0.5) })),
  );
  return { width: W, height: H, ground: GROUND, rocket, trail, worlds, destination, layers };
}
