import { test } from "node:test";
import assert from "node:assert/strict";
import { OBSERVER_QUOTES, quoteOfDay } from "../lib/quotes";
import { guardianFacts } from "../lib/analytics/lines";
import { summarizeLedger, type LedgerEntry, type LedgerKind } from "../lib/analytics/ledger";
import { roadToPaid } from "../lib/analytics/road";

test("observer quote: same all day, changes tomorrow, every quote before a repeat", () => {
  assert.equal(quoteOfDay("2026-10-22").text, quoteOfDay("2026-10-22").text);
  assert.notEqual(quoteOfDay("2026-10-22").text, quoteOfDay("2026-10-23").text);
  const seen = new Set(Array.from({ length: OBSERVER_QUOTES.length }, (_, i) => quoteOfDay(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)).text));
  assert.equal(seen.size, OBSERVER_QUOTES.length);
  assert.ok(OBSERVER_QUOTES.length >= 30);
});

let seq = 0;
const e = (day: string, firm: string, kind: LedgerKind, qty = 1, amount = 0): LedgerEntry => ({ id: `q${++seq}`, day, firm, account: null, kind, amount, qty, note: null, createdAt: null });
const mind = { days: 0, buckets: [], tags: [] };

test("guardian line: plain line from the ledger, facts change when the ledger does", () => {
  const ledger = [e("2026-10-14", "Lucid", "evaluation", 5, 1150), e("2026-10-20", "Lucid", "passed", 5)];
  const s = summarizeLedger(ledger);
  const a = guardianFacts(s, roadToPaid(ledger, s.cost), mind);
  assert.equal(a.fallback.line, "5 of 5 evals passed — 100%. The first payout changes everything.");
  const more = [...ledger, e("2026-10-22", "Lucid", "payout", 1, 1000)];
  const s2 = summarizeLedger(more);
  const b = guardianFacts(s2, roadToPaid(more, s2.cost), mind);
  assert.notDeepEqual(a.facts, b.facts);
  assert.match(b.fallback.line, /\$1,000 paid out against \$1,150 in fees\./);
  assert.equal(guardianFacts(summarizeLedger([]), roadToPaid([], 0), mind).fallback.cite, "Guardian");
});
