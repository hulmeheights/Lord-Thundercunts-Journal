import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoundTrips, type NormalizedFill } from "../lib/brokers/roundtrip";
import { parseProjectXContractId, rootFromSymbol } from "../lib/brokers/contracts";

let n = 0;
function fill(p: Partial<NormalizedFill> & Pick<NormalizedFill, "side" | "qty" | "price">): NormalizedFill {
  n++;
  return {
    id: `t:${n}`,
    provider: "topstepx",
    accountId: "a1",
    contractId: "CON.F.US.MNQ.Z25",
    symbol: "MNQZ5",
    ts: new Date(Date.UTC(2026, 9, 14, 14, 0, n)).toISOString(),
    fees: 0.37,
    brokerPnl: null,
    pointValue: 2,
    ...p,
  };
}

test("simple long round trip computes P&L from points when broker P&L is absent", () => {
  const { trades, openPositions } = buildRoundTrips([fill({ side: "buy", qty: 1, price: 20000 }), fill({ side: "sell", qty: 1, price: 20010 })]);
  assert.equal(openPositions, 0);
  assert.equal(trades.length, 1);
  const t = trades[0]!;
  assert.equal(t.direction, "long");
  assert.equal(t.grossPnl, 20); // 10 points * $2
  assert.equal(t.fees, 0.74);
  assert.equal(t.netPnl, 19.26);
  assert.equal(t.root, "MNQ");
});

test("scaling in and out stays one trade with weighted prices", () => {
  const { trades } = buildRoundTrips([
    fill({ side: "sell", qty: 1, price: 100 }),
    fill({ side: "sell", qty: 1, price: 102 }),
    fill({ side: "buy", qty: 1, price: 99 }),
    fill({ side: "buy", qty: 1, price: 97 }),
  ]);
  assert.equal(trades.length, 1);
  const t = trades[0]!;
  assert.equal(t.direction, "short");
  assert.equal(t.qty, 2);
  assert.equal(t.maxPosition, 2);
  assert.equal(t.entryPrice, 101);
  assert.equal(t.exitPrice, 98);
  assert.equal(t.grossPnl, (101 - 98) * 2 * 2);
});

test("reversal closes one trade and opens another, splitting fees", () => {
  const { trades, openPositions } = buildRoundTrips([
    fill({ side: "buy", qty: 1, price: 100, fees: 1 }),
    fill({ side: "sell", qty: 2, price: 105, fees: 2 }),
    fill({ side: "buy", qty: 1, price: 103, fees: 1 }),
  ]);
  assert.equal(openPositions, 0);
  assert.equal(trades.length, 2);
  const [a, b] = trades;
  assert.equal(a!.direction, "long");
  assert.equal(a!.grossPnl, 10);
  assert.equal(a!.fees, 2); // 1 entry + half of the 2.00 reversal fill
  assert.equal(b!.direction, "short");
  assert.equal(b!.grossPnl, 4);
  assert.equal(b!.fees, 2);
  assert.ok(b!.id.endsWith("r"));
});

test("broker-reported P&L wins over computed P&L when every closing fill has it", () => {
  const { trades } = buildRoundTrips([
    fill({ side: "buy", qty: 1, price: 6064.25, pointValue: 50, contractId: "CON.F.US.EP.H25", symbol: "ESH5", fees: 1.4 }),
    fill({ side: "sell", qty: 1, price: 6065.25, pointValue: 50, contractId: "CON.F.US.EP.H25", symbol: "ESH5", fees: 1.4, brokerPnl: 50 }),
  ]);
  assert.equal(trades[0]!.grossPnl, 50);
  assert.equal(trades[0]!.netPnl, 47.2);
});

test("open position at the end is not emitted as a trade", () => {
  const { trades, openPositions } = buildRoundTrips([fill({ side: "buy", qty: 2, price: 1 }), fill({ side: "sell", qty: 1, price: 2 })]);
  assert.equal(trades.length, 0);
  assert.equal(openPositions, 1);
});

test("contract helpers", () => {
  assert.equal(rootFromSymbol("MNQZ5"), "MNQ");
  assert.equal(rootFromSymbol("ESH25"), "ES");
  assert.equal(rootFromSymbol("6EZ5"), "6E");
  assert.deepEqual(parseProjectXContractId("CON.F.US.ENQ.H25"), { root: "NQ", symbol: "NQH5" });
  assert.deepEqual(parseProjectXContractId("CON.F.US.MNQ.Z25"), { root: "MNQ", symbol: "MNQZ5" });
});
