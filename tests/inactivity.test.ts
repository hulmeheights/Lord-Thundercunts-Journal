import { test } from "node:test";
import assert from "node:assert/strict";
import { atRisk, idleDays, inactivityReminder, newRule, type WatchedAccount } from "../lib/analytics/inactivity";

const acct = (n: number, firm: string, lastTrade: string | null): WatchedAccount => ({ id: `c:${n}`, name: `${firm} ${n}`, firm, lastTrade, since: "2026-10-01" });
const tradeify = (last: (string | null)[]) => last.map((d, i) => acct(i + 1, "Tradeify", d));

test("idle days counted the firm's way", () => {
  assert.equal(idleDays("2026-11-03", "2026-11-08", "calendar"), 5); // Tue → Sun
  assert.equal(idleDays("2026-11-03", "2026-11-08", "trading"), 3); // Wed, Thu, Fri
});

test("off until you hold enough accounts at the firm, then warns per account", () => {
  const rule = { ...newRule("Tradeify"), days: 7, warnBefore: 2, minAccounts: 5 };
  const four = tradeify(["2026-11-03", "2026-11-03", "2026-11-03", "2026-11-03"]);
  assert.equal(atRisk(rule, four, "2026-11-08").risky.length, 0); // only 4 accounts: rule is off
  const five = tradeify(["2026-11-03", "2026-11-03", "2026-11-03", "2026-11-07", "2026-11-07"]);
  const r = atRisk(rule, five, "2026-11-08");
  assert.equal(r.held, 5);
  assert.deepEqual(r.risky.map((x) => [x.account.name, x.left]), [["Tradeify 1", 2], ["Tradeify 2", 2], ["Tradeify 3", 2]]);
  // Another firm's accounts don't count towards Tradeify.
  assert.equal(atRisk(rule, [...four, acct(9, "Lucid", "2026-11-03")], "2026-11-08").held, 4);
});

test("the push: firm, days left, which accounts, at the chosen time", () => {
  const rule = { ...newRule("Tradeify"), days: 7, warnBefore: 2, minAccounts: 5, sendAt: "checkin" as const };
  const five = tradeify(["2026-11-03", "2026-11-03", "2026-11-03", "2026-11-07", "2026-11-07"]);
  const r = inactivityReminder({ rule, accounts: five, today: "2026-11-08", minute: 12 * 60 + 20, sessionStart: 14 * 60 + 30 })!;
  assert.equal(r.title, "Tradeify: 2 days left");
  assert.match(r.body, /^3 of 5 accounts haven't traded since Tue 3 Nov \(Tradeify 1, Tradeify 2, Tradeify 3\)\. Place a keep-alive trade/);
  assert.equal(inactivityReminder({ rule, accounts: five, today: "2026-11-08", minute: 11 * 60, sessionStart: 870 }), null); // not 12:00 yet
  // Own time, trading days, once per quiet spell.
  const own = { ...rule, unit: "trading" as const, days: 5, warnBefore: 1, sendAt: "time" as const, time: "09:15", repeat: "once" as const };
  const o = inactivityReminder({ rule: own, accounts: five, today: "2026-11-09", minute: 9 * 60 + 30, sessionStart: 870 })!;
  assert.match(o.title, /Tradeify: 1 trading day left/);
  assert.equal(o.key, `${own.id}:2026-11-03`);
  // Disabled rules stay quiet.
  assert.equal(inactivityReminder({ rule: { ...rule, enabled: false }, accounts: five, today: "2026-11-08", minute: 12 * 60 + 20, sessionStart: 870 }), null);
});
