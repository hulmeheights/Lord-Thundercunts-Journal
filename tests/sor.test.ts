import { test } from "node:test";
import assert from "node:assert/strict";
import { barTimeOf, PHASE_DEFAULTS, rulesFor, secretOf, SorSignal, withoutSecret } from "../lib/bot/sor";

const raw = { secret: "s3cret-s3cret-s3cret", event: "signal", swing: "3/3", session: "LON", dow: "Tue", mins_in: 47, quiet: false, dir: "LONG", entry: 28133.5, stop: 28103.25, target: 28254.25, quiet_target: null, atr: 14.11, id: "1762160520000-3/3-L" };

test("the script's signal parses, and the secret is never kept", () => {
  const s = SorSignal.parse(raw);
  const kept = withoutSecret(s);
  assert.equal("secret" in kept, false);
  assert.equal(JSON.stringify(kept).includes("s3cret"), false);
  assert.equal(kept.target, 28254.25);
  assert.ok(SorSignal.safeParse({ ...raw, target: null, quiet: true, quiet_target: 28148.5 }).success);
  assert.ok(!SorSignal.safeParse({ ...raw, swing: "4/4" }).success);
});

test("the secret is read from the top level (signals) or data (older alerts); a wrong one doesn't match", () => {
  assert.equal(secretOf(raw), raw.secret);
  assert.equal(secretOf({ data: { secret: "old" } }), "old");
  assert.notEqual(secretOf({ ...raw, secret: "wrong" }), raw.secret);
  assert.equal(secretOf(null), "");
});

test("the signal candle's time comes from its id", () => {
  assert.equal(barTimeOf(raw.id)?.toISOString(), "2025-11-03T09:02:00.000Z");
  assert.equal(barTimeOf("nonsense"), null);
});

test("card rules fall back to the tested defaults for their phase", () => {
  assert.deepEqual(rulesFor("eval", {}), PHASE_DEFAULTS.eval);
  assert.deepEqual(rulesFor("funded", null), PHASE_DEFAULTS.funded);
  assert.equal(rulesFor("eval", { minRR: 2 }).minRR, 2);
  assert.deepEqual(rulesFor("eval", { swing: "9/9" }), PHASE_DEFAULTS.eval); // broken settings never half-apply
});

test("dry-run check: matched, missing (with the step), extra and different trades", async () => {
  const { compareDryRun, parseExpected, tradingDay } = await import("../lib/bot/drycheck");
  assert.equal(tradingDay("2026-11-05T22:59:00Z"), "2026-11-05");
  assert.equal(tradingDay("2026-11-05T23:00:00Z"), "2026-11-06");
  const { rows } = parseExpected([
    ["mode", "trading_day", "time_NY", "time_UK", "session", "dir", "entry_fill", "stop", "target", "quiet", "capped", "pnl_usd"],
    ["funded", "2026-11-02", "2026-11-02 04:35", "", "LON", "SHORT", "28766.0", "28802.25", "28695.5", "False", "False", "-371.2"],
    ["funded", "2026-11-03", "2026-11-03 03:52", "", "LON", "LONG", "28133.5", "28103.25", "28293.25", "False", "True", "1591.3"],
    ["funded", "2026-11-04", "2026-11-04 10:00", "", "NYAM", "LONG", "1", "1", "2", "False", "False", "0"],
    ["eval", "2026-11-02", "2026-11-02 04:35", "", "LON", "SHORT", "28766.0", "28802.25", "28606.25", "False", "True", "-371.2"],
  ]);
  const card = { id: "ba_f", label: "Express", phase: "funded" as const };
  const ours = [
    { cardId: "ba_f", status: "closed", session: "LON", dir: "SHORT", stop: 28802.25, target: 28695.5, enteredAt: "2026-11-02T09:35:00Z", step: null, reason: null },
    { cardId: "ba_f", status: "closed", session: "LON", dir: "LONG", stop: 28103.25, target: 28293.0, enteredAt: "2026-11-03T08:52:00Z", step: null, reason: null }, // 0.25 off: still a match
    { cardId: "ba_f", status: "skipped", session: "NYAM", dir: "LONG", stop: 1, target: 2, enteredAt: "2026-11-04T15:00:00Z", step: 10, reason: "daily loss limit" },
    { cardId: "ba_f", status: "open", session: "NYPM", dir: "SHORT", stop: 5, target: 4, enteredAt: "2026-11-04T19:00:00Z", step: null, reason: null },
  ];
  const [r] = compareDryRun(rows, ours, [card], new Set(["2026-11-02", "2026-11-03", "2026-11-04"]));
  assert.equal(r!.expected, 3);
  assert.equal(r!.matched, 2);
  assert.deepEqual(r!.diffs.map((d) => d.kind), ["missing", "extra"]);
  assert.match(r!.diffs[0]!.detail, /step 10/);
});

test("2-year backtest: every trade loads, and the Combine and payout simulations match the backtest's own figures", async () => {
  const { backtestTrades, combineSim, payoutSim } = await import("../lib/bot/backtest");
  const { tally } = await import("../lib/bot/history");
  const e = backtestTrades("eval");
  const f = backtestTrades("funded");
  assert.equal(e.length + f.length, 721);
  assert.equal(Math.round(tally(e).pf! * 100) / 100, 1.52); // spec: eval PF 1.52
  assert.equal(Math.round(tally(f).pf! * 100) / 100, 1.61); // spec: funded PF 1.61
  const c = combineSim(e);
  assert.ok(c.rate! > 0.7 && c.rate! < 0.8); // spec: 75% pass rate
  assert.ok(payoutSim(f).rate! > 0.4);
  // A tiny Combine: +$1,600, +$1,500 fails consistency until a third day evens it out.
  const t = (day: string, pnl: number) => ({ ...e[0]!, day, pnl });
  assert.equal(combineSim([t("2026-01-05", 1600), t("2026-01-06", 1500), t("2026-01-07", 300)]).passed, 1);
  assert.equal(combineSim([t("2026-01-05", -1000), t("2026-01-06", -1000)]).failed, 1); // from day 1 it touches −$2,000; from day 2 it never does
});
