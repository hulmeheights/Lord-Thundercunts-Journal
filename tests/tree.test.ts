import { test } from "node:test";
import assert from "node:assert/strict";
import { growTree } from "../lib/analytics/tree";

test("tree: a branch per goal, a leaf per step, a blossom per goal reached, and the same tree every time", () => {
  const goals = [
    { id: "goal_a", done: true, steps: 3 },
    { id: "goal_b", done: false, steps: 20 },
    { id: "goal_c", done: false, steps: 0 },
  ];
  const t = growTree(goals);
  assert.equal(t.branches.length, 3);
  assert.deepEqual(t.branches.map((b) => [b.done, b.leaves.length]), [[true, 3], [false, 12], [false, 0]]); // leaves cap at 12 per branch
  assert.deepEqual(growTree(goals), t);
  const taller = growTree([...goals, { id: "goal_d", done: true, steps: 2 }]);
  const top = (d: string) => Number(d.trim().split(/\s+/).pop());
  assert.ok(top(taller.trunk) < top(t.trunk)); // the crown rises as goals are added
  assert.ok(taller.trunkWidth > t.trunkWidth); // and the trunk thickens with each one reached
  for (const b of taller.branches) assert.ok(b.tip.x >= 18 && b.tip.x <= 382 && b.tip.y >= 14);
  assert.equal(growTree([]).branches.length, 0);
});
