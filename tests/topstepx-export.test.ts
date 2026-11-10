import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../lib/import/csv";
import { mapRows } from "../lib/import/formats";
import { guessDateOrder } from "../lib/import/values";

// TopstepX → Trades → Export (Nov 2026 layout).
const csv = `Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type,TradeDay,TradeDuration,Commissions
3289725064,MNQZ6,11/06/2026 15:47:00 +00:00,11/06/2026 15:50:04 +00:00,27223.000000000,27252.000000000,3.6000,-290.000000000,5,Short,11/06/2026 00:00:00 -06:00,00:03:04.0390280,2.5000
3299054291,MNQZ6,11/10/2026 14:32:38 +00:00,11/10/2026 14:36:25 +00:00,27678.000000000,27809.250000000,3.6000,1312.500000000,5,Long,11/10/2026 00:00:00 -06:00,00:03:46.9611600,2.5000
`;

test("a TopstepX trades export reads as round trips, with UTC times, sides, P&L and fees + commissions", () => {
  const rows = parseCsv(csv);
  const r = mapRows(rows, { tz: "Europe/London", dateOrder: guessDateOrder(rows, new Date("2026-11-10T20:00:00Z")) ?? "MDY" });
  assert.equal(r.shape, "round-trips");
  assert.equal(r.items.length, 2);
  const [a, b] = r.items as Extract<(typeof r.items)[number], { kind: "trade" }>[];
  assert.deepEqual([a!.direction, a!.entryTime, a!.grossPnl, a!.fees, a!.qty], ["short", "2026-11-06T15:47:00.000Z", -290, 6.1, 5]);
  assert.deepEqual([b!.direction, b!.exitTime, b!.grossPnl], ["long", "2026-11-10T14:36:25.000Z", 1312.5]);
});
