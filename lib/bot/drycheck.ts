/**
 * Dry-run check (spec: Testing before live, stage 3): the bot's decisions per
 * account against an expected-trades file. Same trades taken, same direction,
 * same stop and target (within 0.25), same skips. Pure, so it's unit-tested.
 */
import { addDays, dayKey } from "../analytics/time";

const NY = "America/New_York";
export type ExpectedRow = { mode: "eval" | "funded"; day: string; session: string; dir: "LONG" | "SHORT"; stop: number; target: number; timeNY: string; pnl: number | null };
export type OurRow = { cardId: string; status: string; session: string; dir: string; stop: number; target: number | null; enteredAt: string; step: number | null; reason: string | null };
export type CardInfo = { id: string; label: string; phase: "eval" | "funded" };
export type Diff = { kind: "missing" | "extra" | "different"; day: string; session: string; dir: string; detail: string };

/** The trading day a moment belongs to: 18:00 New York starts the next one. */
export function tradingDay(iso: string): string {
  const d = dayKey(iso, NY);
  const h = Number(new Date(iso).toLocaleString("en-US", { timeZone: NY, hour: "numeric", hour12: false })) % 24;
  return h >= 18 ? addDays(d, 1) : d;
}

/** Reads the expected-trades CSV (mode, trading_day, time_NY, session, dir, stop, target, …). */
export function parseExpected(rows: string[][]): { rows: ExpectedRow[]; error?: string } {
  const [head, ...data] = rows;
  const h = (head ?? []).map((x) => x.trim().toLowerCase());
  const at = (k: string) => h.indexOf(k);
  const need = ["mode", "trading_day", "session", "dir", "stop", "target"];
  if (need.some((k) => at(k) < 0)) return { rows: [], error: `This doesn't look like an expected-trades file (needs ${need.join(", ")}).` };
  const out: ExpectedRow[] = [];
  for (const r of data) {
    const mode = r[at("mode")]?.trim();
    const dir = r[at("dir")]?.trim().toUpperCase();
    if ((mode !== "eval" && mode !== "funded") || (dir !== "LONG" && dir !== "SHORT")) continue;
    out.push({ mode, day: r[at("trading_day")]!.trim(), session: r[at("session")]!.trim(), dir, stop: Number(r[at("stop")]), target: Number(r[at("target")]), timeNY: at("time_ny") >= 0 ? (r[at("time_ny")] ?? "") : "", pnl: at("pnl_usd") >= 0 ? Number(r[at("pnl_usd")]) : null });
  }
  return { rows: out };
}

/**
 * Per account: only the trading days the bot actually received signals on are
 * compared (before that it couldn't have taken anything).
 */
export function compareDryRun(expected: ExpectedRow[], ours: OurRow[], cards: CardInfo[], signalDays: Set<string>) {
  return cards.map((c) => {
    const want = expected.filter((e) => e.mode === c.phase && signalDays.has(e.day));
    const mine = ours.filter((o) => o.cardId === c.id);
    const taken = mine.filter((o) => o.status === "open" || o.status === "closed");
    const inRange = (d: string) => signalDays.has(d) && (!expected.length || (d >= expected[0]!.day && d <= expected.at(-1)!.day) || want.some((w) => w.day === d));
    const key = (day: string, s: string, d: string) => `${day}|${s}|${d}`;
    const diffs: Diff[] = [];
    let matched = 0;
    const used = new Set<OurRow>();
    for (const w of want) {
      const hit = taken.find((o) => !used.has(o) && key(tradingDay(o.enteredAt), o.session, o.dir) === key(w.day, w.session, w.dir));
      if (!hit) {
        const skip = mine.find((o) => o.status === "skipped" && key(tradingDay(o.enteredAt), o.session, o.dir) === key(w.day, w.session, w.dir));
        diffs.push({ kind: "missing", day: w.day, session: w.session, dir: w.dir, detail: skip ? `expected a trade; the bot skipped it at step ${skip.step ?? "?"} (${skip.reason ?? "no reason"})` : "expected a trade; no matching signal reached the bot" });
        continue;
      }
      used.add(hit);
      const bad: string[] = [];
      if (Math.abs(hit.stop - w.stop) > 0.25) bad.push(`stop ${hit.stop} vs ${w.stop}`);
      if (hit.target == null || Math.abs(hit.target - w.target) > 0.25) bad.push(`target ${hit.target ?? "none"} vs ${w.target}`);
      if (bad.length) diffs.push({ kind: "different", day: w.day, session: w.session, dir: w.dir, detail: bad.join(" · ") });
      else matched++;
    }
    for (const o of taken) {
      const d = tradingDay(o.enteredAt);
      if (!used.has(o) && inRange(d)) diffs.push({ kind: "extra", day: d, session: o.session, dir: o.dir, detail: `the bot took it (SL ${o.stop} · TP ${o.target ?? "none"}); not in the expected file` });
    }
    diffs.sort((a, b) => a.day.localeCompare(b.day));
    return { card: c, expected: want.length, matched, diffs };
  });
}
