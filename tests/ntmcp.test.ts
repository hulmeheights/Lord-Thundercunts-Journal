import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_TOOLS, FILL_TOOLS, isReadTool, readPastedCallback, parseAccounts, parseFills, parseRpcBody, pickTool, toolPayload } from "../lib/brokers/ntmcp-parse";

const wrap = (v: unknown) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });

test("toolPayload reads JSON text, JSON inside prose, and structuredContent", () => {
  assert.deepEqual(toolPayload(wrap([{ a: 1 }])), [[{ a: 1 }]]);
  assert.deepEqual(toolPayload({ content: [{ type: "text", text: 'Here you go:\n[{"a":2}]\nDone.' }] }), [[{ a: 2 }]]);
  assert.deepEqual(toolPayload({ structuredContent: { x: 1 }, content: [] }), [{ x: 1 }]);
  assert.deepEqual(toolPayload({ content: [{ type: "text", text: "no data" }] }), []);
});

test("parseAccounts finds accounts wherever they sit and skips non-account rows", () => {
  const p = toolPayload(wrap({ accounts: [{ id: 101, name: "LFE0506-01", balance: "50,123.50", active: true }, { id: 102, name: "TDY-2", archived: true }], positions: [{ name: "MNQZ6", netPos: 1, price: 1 }] }));
  const a = parseAccounts(p);
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], { externalId: "101", name: "LFE0506-01", isSim: true, balance: 50123.5, active: true });
  assert.equal(a[1]!.active, false);
});

test("parseFills normalises Tradovate-style fills and de-duplicates", () => {
  const raw = [
    { id: 9001, contractName: "MNQZ6", action: "Buy", qty: 2, price: 21010.25, timestamp: "2026-10-14T13:31:02.120Z" },
    { id: 9002, contractName: "MNQZ6.CME", action: "Sell", qty: 2, price: 21016.5, timestamp: "2026-10-14T13:40:00Z", commission: -1.24 },
    { id: 9002, contractName: "MNQZ6", action: "Sell", qty: 2, price: 21016.5, timestamp: "2026-10-14T13:40:00Z" },
    { id: 9003, contractName: "MNQZ6", action: "Hold", qty: 1, price: 1, timestamp: "2026-10-14T13:40:00Z" },
  ];
  const f = parseFills(toolPayload(wrap({ fills: raw })), { connectionId: "ntmcp-demo", accountKey: "101" });
  assert.equal(f.length, 2);
  assert.equal(f[0]!.id, "ntmcp-demo:9001");
  assert.equal(f[0]!.accountId, "ntmcp-demo:101");
  assert.equal(f[0]!.side, "buy");
  assert.equal(f[0]!.pointValue, 2);
  assert.equal(f[1]!.symbol, "MNQZ6");
  assert.equal(f[1]!.fees, 1.24);
});

test("pickTool only ever returns an exact allow-listed read tool", () => {
  assert.equal(pickTool(["my_portfolio", "list_accounts", "fill_history"], ACCOUNT_TOOLS), "list_accounts");
  assert.equal(pickTool(["my_portfolio", "fill_history"], ACCOUNT_TOOLS), "my_portfolio");
  assert.equal(pickTool(["order_history", "fill_history"], FILL_TOOLS), "fill_history");
  assert.equal(pickTool(["fills", "get_fills", "executions"], FILL_TOOLS), null);
  assert.equal(pickTool(["account_settings", "close_account"], ACCOUNT_TOOLS), null);
});

test("parseRpcBody reads plain JSON and SSE frames", () => {
  assert.deepEqual(parseRpcBody("application/json", '{"jsonrpc":"2.0","id":1,"result":{}}', 1), { jsonrpc: "2.0", id: 1, result: {} });
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"note"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"ok":true}}\n\n';
  assert.deepEqual(parseRpcBody("text/event-stream", sse, 3), { jsonrpc: "2.0", id: 3, result: { ok: true } });
});

test("anything that is not an exact read tool is refused", () => {
  for (const w of ["place_order", "cancel_order", "cancel_all_orders", "close_position", "liquidate_account", "liquidate_position", "flatten_all", "modify_order", "close_account", "delete_account", "reset_account", "set_risk", "update_alert", "fills", "account_settings", "List_Accounts", "fill_history ", ""]) assert.equal(isReadTool(w), false, JSON.stringify(w));
  for (const r of ["fill_history", "list_accounts", "my_portfolio", "accounts"]) assert.equal(isReadTool(r), true, r);
});
