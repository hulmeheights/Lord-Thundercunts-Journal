import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, sniffDelimiter } from "../lib/import/csv";
import { parseDateTime, parseNumber, parseSide } from "../lib/import/values";

test("csv parser handles quotes, CRLF, BOM and semicolons", () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x, y","he said ""hi"""\r\n\r\n2,,3\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "x, y", 'he said "hi"'], ["2", "", "3"]]);
  assert.equal(sniffDelimiter("a;b;c\n1;2;3"), ";");
  assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("number parsing", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("(12.50)"), -12.5);
  assert.equal(parseNumber("−$5"), -5);
  assert.equal(parseNumber("-$1,000.00"), -1000);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
});

test("date parsing across platform formats", () => {
  const tz = "America/New_York";
  assert.equal(parseDateTime("2026-10-14T13:31:22Z", tz), "2026-10-14T13:31:22.000Z");
  assert.equal(parseDateTime("2026-10-14 13:31:22 +00:00", tz), "2026-10-14T13:31:22.000Z");
  assert.equal(parseDateTime("10/14/2026 09:31:22", tz), "2026-10-14T13:31:22.000Z");
  assert.equal(parseDateTime("10/14/2026 9:31:22 AM", tz), "2026-10-14T13:31:22.000Z");
  assert.equal(parseDateTime("2026-10-14 09:31:22.500", tz), "2026-10-14T13:31:22.500Z");
  assert.equal(parseDateTime("14/10/2026 09:31", tz), "2026-10-14T13:31:00.000Z");
  assert.equal(parseDateTime("garbage", tz), null);
});

test("side parsing", () => {
  assert.equal(parseSide("Buy"), "buy");
  assert.equal(parseSide("Sld"), "sell");
  assert.equal(parseSide("Long"), "buy");
  assert.equal(parseSide("short"), "sell");
  assert.equal(parseSide("?"), null);
});

import { mapRows } from "../lib/import/formats";

test("offset-suffixed US dates are absolute (TopstepX export)", () => {
  assert.equal(parseDateTime("05/07/2024 13:33:37 +00:00", "America/New_York"), "2024-05-07T13:33:37.000Z");
  assert.equal(parseDateTime("09/28/2026 10:43:54 +02:00", "America/New_York"), "2026-09-28T08:43:54.000Z");
  assert.equal(parseDateTime("09/28/2026 00:00:00 -05:00", "Europe/London"), "2026-09-28T05:00:00.000Z");
});

test("TopstepX trades export maps to round trips with fees + commissions", () => {
  const csv = [
    "﻿Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type,TradeDay,TradeDuration,Commissions",
    "3142050021,MNQZ6,09/28/2026 10:43:54 +02:00,09/28/2026 10:47:38 +02:00,30584.000000000,30600.250000000,0.72000,-32.500000000,1,Short,09/28/2026 00:00:00 -05:00,00:03:44.2166590,0.50000",
    "37199170,NQM4,05/07/2024 13:33:37 +00:00,05/07/2024 13:34:07 +00:00,18228.250000000,18223.750000000,1.4000,90.000000000,1,Short,05/07/2024 05:00:00 +00:00,,",
  ].join("\n");
  const r = mapRows(parseCsv(csv), { tz: "America/New_York" });
  assert.equal(r.shape, "round-trips");
  assert.equal(r.items.length, 2);
  const a = r.items[0]!;
  assert.equal(a.kind, "trade");
  if (a.kind !== "trade") return;
  assert.equal(a.direction, "short");
  assert.equal(a.grossPnl, -32.5);
  assert.equal(a.fees, 1.22);
  assert.equal(a.entryTime, "2026-09-28T08:43:54.000Z");
  assert.equal(a.key, "id:3142050021");
  const b = r.items[1]!;
  if (b.kind !== "trade") return;
  assert.equal(b.fees, 1.4);
  assert.equal(b.grossPnl, 90);
});

test("Tradovate-style negative money and Rithmic-style headers", () => {
  assert.equal(parseNumber("$(25.00)"), -25);
  assert.equal(parseNumber("($1,250.50)"), -1250.5);
  assert.equal(parseNumber("-$(5)"), -5);
  const perf = [
    "symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration",
    "MNQZ6,-2,0,0.25,111,222,2,21000.25,20990.25,$(40.00),10/14/2026 09:31:00,10/14/2026 09:35:00,4min",
    "MNQZ6,-2,0,0.25,333,444,1,21010.00,21020.00,$20.00,10/14/2026 09:50:00,10/14/2026 09:41:00,9min",
  ].join("\n");
  const r = mapRows(parseCsv(perf), { tz: "America/New_York", feePerContract: () => 1 });
  assert.equal(r.shape, "tradovate-performance");
  const [a, b] = r.items;
  if (a?.kind !== "trade" || b?.kind !== "trade") throw new Error("expected trades");
  assert.equal(a.direction, "long");
  assert.equal(a.grossPnl, -40);
  assert.equal(a.fees, 2);
  assert.equal(b.direction, "short"); // sold before bought
  assert.equal(b.entryPrice, 21020);
  const rithmic = ["Account,Status,Buy/Sell,Qty Filled,Avg Fill Price,Symbol,Update Time,Order Number,Commission", "LT123,Filled,B,2,5000.25,MESZ6,10/14/2026 10:00:00,9001,1.00", "LT123,Cancelled,S,0,0,MESZ6,10/14/2026 10:01:00,9002,0"].join("\n");
  const rr = mapRows(parseCsv(rithmic), { tz: "America/New_York" });
  assert.equal(rr.shape, "fills");
  assert.equal(rr.items.length, 1);
  const f = rr.items[0]!;
  if (f.kind !== "fill") throw new Error("expected fill");
  assert.equal(f.side, "buy");
  assert.equal(f.qty, 2);
  assert.equal(f.fees, 1);
  assert.equal(f.account, "LT123");
});
