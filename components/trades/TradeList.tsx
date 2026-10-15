"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, FileUp, Plus, Search } from "lucide-react";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { dayKey, fmtHold, holdMinutes, longDate, timeInTz, addDays, todayKey } from "@/lib/analytics/time";
import { summarize } from "@/lib/analytics/stats";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Sheet } from "@/components/ui/Sheet";
import { ManualTradeForm } from "./ManualTradeForm";
import { ImportSheet } from "./ImportSheet";

type Range = "7" | "30" | "90" | "all";
type Result = "all" | "win" | "loss";

export function TradeList({
  trades,
  tz,
  setups,
  accounts,
  openImport = false,
}: {
  trades: Trade[];
  tz: string;
  setups: string[];
  accounts: string[];
  openImport?: boolean;
}) {
  const [range, setRange] = useState<Range>("30");
  const [result, setResult] = useState<Result>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(openImport);

  const filtered = useMemo(() => {
    const today = todayKey(tz);
    const from = range === "all" ? "0000" : addDays(today, -Number(range));
    const needle = q.trim().toLowerCase();
    return trades
      .filter((t) => dayKey(t.exitTime, tz) >= from)
      .filter((t) => (result === "win" ? t.netPnl > 0 : result === "loss" ? t.netPnl < 0 : true))
      .filter((t) =>
        !needle
          ? true
          : [t.symbol, t.root, t.setup ?? "", t.emotion ?? "", ...t.tags, ...t.mistakes, t.notes ?? ""].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => b.exitTime.localeCompare(a.exitTime));
  }, [trades, tz, range, result, q]);

  const groups = useMemo(() => {
    const m = new Map<string, Trade[]>();
    for (const t of filtered) {
      const d = dayKey(t.exitTime, tz);
      m.set(d, [...(m.get(d) ?? []), t]);
    }
    return [...m.entries()];
  }, [filtered, tz]);

  const s = summarize(filtered);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "7", label: "7D" },
            { value: "30", label: "30D" },
            { value: "90", label: "90D" },
            { value: "all", label: "All" },
          ]}
        />
        <Segmented
          value={result}
          onChange={setResult}
          options={[
            { value: "all", label: "All" },
            { value: "win", label: "Wins" },
            { value: "loss", label: "Losses" },
          ]}
        />
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol, setup, mistake, note…" className="field h-10 rounded-full pl-10 text-[14px]" />
        </div>
        <Button variant="secondary" size="md" onClick={() => setImporting(true)}>
          <FileUp size={16} /> Import
        </Button>
        <Button variant="primary" size="md" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add trade
        </Button>
      </div>

      <div className="glass mb-5 grid grid-cols-2 gap-4 rounded-[24px] p-5 sm:grid-cols-5">
        <div>
          <div className="text-[12px] text-ink-3">Net P&amp;L</div>
          <div className={cn("num text-[22px] font-bold", s.net >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(s.net, { sign: true })}</div>
        </div>
        <div>
          <div className="text-[12px] text-ink-3">Trades</div>
          <div className="num text-[22px] font-bold">{s.trades}</div>
        </div>
        <div>
          <div className="text-[12px] text-ink-3">Win rate</div>
          <div className="num text-[22px] font-bold">{fmtPct(s.winRate)}</div>
        </div>
        <div>
          <div className="text-[12px] text-ink-3">Profit factor</div>
          <div className="num text-[22px] font-bold">{Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}</div>
        </div>
        <div>
          <div className="text-[12px] text-ink-3">Made / lost</div>
          <div className="num text-[15px] font-semibold">
            <span className="text-pos">{fmtMoney(s.totalWon, { compact: true })}</span>
            <span className="text-ink-4"> / </span>
            <span className="text-neg">{fmtMoney(-s.totalLost, { compact: true })}</span>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <Empty icon={<Search size={22} />} title="No trades here">
          Try a wider range, or connect a broker in Settings so trades log themselves.
        </Empty>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, list]) => {
            const net = list.reduce((x, t) => x + t.netPnl, 0);
            return (
              <section key={day}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <Link href={`/journal/${day}`} className="text-[13px] font-semibold text-ink-2 hover:text-ink">
                    {longDate(day)}
                  </Link>
                  <span className={cn("num text-[13px] font-semibold", net >= 0 ? "text-pos" : "text-neg")}>{fmtMoney(net, { sign: true })}</span>
                </div>
                <div className="glass divide-y divide-line overflow-hidden rounded-[22px]">
                  {list.map((t) => (
                    <Link key={t.id} href={`/trades/${encodeURIComponent(t.id)}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-fill sm:gap-4">
                      <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", t.direction === "long" ? "bg-pos/12 text-pos" : "bg-neg/12 text-neg")}>
                        {t.direction === "long" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14.5px] font-semibold">{t.root}</span>
                          <span className="num text-[12px] text-ink-3">×{t.qty}</span>
                          {t.setup && <span className="hidden truncate rounded-full bg-fill-2 px-2 py-0.5 text-[11px] text-ink-2 sm:inline">{t.setup}</span>}
                          {t.mistakes.length > 0 && <span className="rounded-full bg-neg/12 px-2 py-0.5 text-[11px] text-neg">{t.mistakes.length} mistake{t.mistakes.length > 1 ? "s" : ""}</span>}
                          {t.source === "sample" && <span className="rounded-full bg-fill-2 px-2 py-0.5 text-[10.5px] text-ink-4">sample</span>}
                        </div>
                        <div className="num mt-0.5 truncate text-[12px] text-ink-3">
                          {timeInTz(t.entryTime, tz)} · {fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)} · {fmtHold(holdMinutes(t.entryTime, t.exitTime))}
                        </div>
                      </div>
                      <div className={cn("num text-right text-[15px] font-semibold", t.netPnl >= 0 ? "text-pos" : "text-neg")}>
                        {fmtMoney(t.netPnl, { sign: true })}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Sheet open={importing} onClose={() => setImporting(false)} title="Import trades (free)" wide>
        <ImportSheet tz={tz} accounts={accounts} onDone={() => setImporting(false)} />
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Log a trade manually">
        <ManualTradeForm setups={setups} tz={tz} onDone={() => setAdding(false)} />
      </Sheet>
    </div>
  );
}
