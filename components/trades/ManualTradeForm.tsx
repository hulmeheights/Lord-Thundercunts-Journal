"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { addManualTrade } from "@/lib/actions/trades";
import { todayKey } from "@/lib/analytics/time";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";

export function ManualTradeForm({ setups, tz, onDone }: { setups: string[]; tz: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"long" | "short">("long");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const n = (k: string) => Number(f.get(k));
        start(async () => {
          const res = await addManualTrade({
            symbol: String(f.get("symbol")),
            direction,
            qty: n("qty"),
            day: String(f.get("day")),
            entryTime: String(f.get("entryTime")),
            exitTime: String(f.get("exitTime")),
            entryPrice: n("entryPrice"),
            exitPrice: n("exitPrice"),
            fees: n("fees") || 0,
            pointValue: f.get("pointValue") ? n("pointValue") : null,
            setup: (f.get("setup") as string) || null,
          });
          if (res.error) setError(res.error);
          else {
            onDone();
            router.push(`/trades/${encodeURIComponent(res.id!)}`);
          }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Symbol</span>
          <input name="symbol" required placeholder="MNQZ6" className="field" />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Contracts</span>
          <input name="qty" type="number" min="1" step="1" defaultValue={1} required className="field" />
        </label>
      </div>
      <Segmented value={direction} onChange={setDirection} options={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]} />
      <div className="grid grid-cols-3 gap-3">
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Date</span>
          <input name="day" type="date" required defaultValue={todayKey(tz)} className="field" />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Entry time</span>
          <input name="entryTime" type="time" required defaultValue="09:45" className="field" />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Exit time</span>
          <input name="exitTime" type="time" required defaultValue="09:52" className="field" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Entry price</span>
          <input name="entryPrice" type="number" step="any" required className="field" />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Exit price</span>
          <input name="exitPrice" type="number" step="any" required className="field" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">Fees ($)</span>
          <input name="fees" type="number" step="any" min="0" defaultValue={0} className="field" />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12.5px] text-ink-3">$ per point (auto)</span>
          <input name="pointValue" type="number" step="any" min="0" placeholder="auto" className="field" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-[12.5px] text-ink-3">Setup</span>
        <select name="setup" className="field" defaultValue="">
          <option value="">—</option>
          {setups.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="text-[13px] text-neg">{error}</div>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending && <LoaderCircle size={17} className="animate-spin" />} Save trade
      </Button>
    </form>
  );
}
