/**
 * The goal tree: a trunk that rises with every goal you set, a branch for each
 * goal, a leaf for every step you log towards it, and a blossom when it's
 * reached. Deterministic (seeded by the goal ids), so the tree you saw
 * yesterday is the tree you see today, plus whatever you've grown since.
 */

export type TreeGoal = { id: string; done: boolean; steps: number };
export type Leaf = { x: number; y: number; angle: number };
export type Branch = { id: string; d: string; tip: { x: number; y: number }; done: boolean; leaves: Leaf[]; side: -1 | 1 };
export type Tree = { width: number; height: number; ground: number; /** Highest point drawn, so the view can frame the tree. */ crown: number; trunk: string; trunkWidth: number; branches: Branch[]; roots: string[] };

const W = 400;
const H = 480;
const GROUND = 448;
const MAX_LEAVES = 12;

/** A stable 0–1 number from a string. */
function rand(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export function growTree(goals: TreeGoal[]): Tree {
  const n = goals.length;
  const done = goals.filter((g) => g.done).length;
  const steps = goals.reduce((s, g) => s + g.steps, 0);
  // A sapling to start; it rises with each goal and thickens with each one reached.
  const height = Math.min(GROUND - 36, 110 + n * 24 + Math.min(steps, 40) * 1.5);
  const top = GROUND - height;
  const sway = (rand(goals[0]?.id ?? "seed") - 0.5) * 24;
  const cx = W / 2;
  // Trunk: a cubic from the ground to the crown.
  const p0 = { x: cx, y: GROUND };
  const p1 = { x: cx - sway, y: GROUND - height * 0.35 };
  const p2 = { x: cx + sway, y: GROUND - height * 0.7 };
  const p3 = { x: cx + sway * 0.4, y: top };
  const trunkAt = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  };

  const branches: Branch[] = goals.map((g, i) => {
    const t = 0.3 + (0.64 * (i + 1)) / (n + 1);
    const base = trunkAt(t);
    const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const grown = Math.min(g.steps, 8);
    const len = 46 + grown * 7 + (g.done ? 30 : 0) + rand(g.id, 1) * 14;
    const rise = len * (0.38 + rand(g.id, 2) * 0.22);
    const tip = { x: Math.max(18, Math.min(W - 18, base.x + side * len)), y: Math.max(14, base.y - rise) };
    const c = { x: base.x + side * len * 0.45, y: base.y - rise * 0.1 };
    const d = `M${r1(base.x)} ${r1(base.y)} Q${r1(c.x)} ${r1(c.y)} ${r1(tip.x)} ${r1(tip.y)}`;
    const leaves: Leaf[] = [];
    for (let k = 0; k < Math.min(g.steps, MAX_LEAVES); k++) {
      const s = 0.32 + (0.62 * (k + 1)) / (Math.min(g.steps, MAX_LEAVES) + 1);
      const u = 1 - s;
      const x = u * u * base.x + 2 * u * s * c.x + s * s * tip.x;
      const y = u * u * base.y + 2 * u * s * c.y + s * s * tip.y;
      const up = k % 2 === 0 ? -1 : 1;
      leaves.push({ x: r1(x), y: r1(y + up * 6), angle: Math.round(side * 35 + up * 40 + (rand(g.id, 10 + k) - 0.5) * 30) });
    }
    return { id: g.id, d, tip: { x: r1(tip.x), y: r1(tip.y) }, done: g.done, leaves, side };
  });

  const roots = [-1, 1].map((s) => `M${cx} ${GROUND} q${s * 18} 6 ${s * (30 + done * 3)} 14`);
  return {
    width: W,
    height: H,
    ground: GROUND,
    crown: Math.max(0, Math.min(top, ...branches.map((b) => b.tip.y)) - 28),
    trunk: `M${r1(p0.x)} ${r1(p0.y)} C${r1(p1.x)} ${r1(p1.y)} ${r1(p2.x)} ${r1(p2.y)} ${r1(p3.x)} ${r1(p3.y)}`,
    trunkWidth: Math.min(7, 2 + done * 0.6),
    branches,
    roots,
  };
}
