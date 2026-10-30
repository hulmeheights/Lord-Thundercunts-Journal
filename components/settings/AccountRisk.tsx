"use client";

import { useEffect, useRef, useState } from "react";
import { saveAccountRisk } from "@/lib/actions/settings";
import { cn } from "@/lib/cn";
import { Sub } from "./ui";

/** 1R for each account: type it, or leave it blank and it's worked out from that account's usual full loss. */
export function AccountRisk({ accounts, initial }: { accounts: { id: string; name: string; detected: number | null }[]; initial: Record<string, number> }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, initial[a.id] ? String(initial[a.id]) : ""])));
  const [status, setStatus] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("Saving…");
    const t = setTimeout(async () => {
      const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x) > 0 ? Number(x) : null]));
      const r = await saveAccountRisk(out);
      setStatus("error" in r && r.error ? r.error : "Saved");
    }, 700);
    return () => clearTimeout(t);
  }, [v]);
  if (!accounts.length) return null;
  return (
    <div className="mt-14 max-w-3xl">
      <Sub aside={<span className={cn("font-mono text-[10px]", status === "Saved" ? "text-pos" : "text-ink-4")}>{status || "Changes save as you go"}</span>}>1R per account</Sub>
      <ul>
        {accounts.map((a) => (
          <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-4 gap-y-1 border-b border-line py-2.5 font-mono text-[11.5px]">
            <span className="min-w-0 break-all text-ink">
              {a.name}
              <span className="block text-[10px] text-ink-4">{a.detected ? `Worked out: $${a.detected.toLocaleString("en-GB")}` : "Not enough losses yet to work it out"}</span>
            </span>
            <label className="flex items-baseline gap-1.5 border-b border-line-2 focus-within:border-ink-3">
              <span className="text-ink-4">$</span>
              <input
                inputMode="decimal"
                className="num w-full bg-transparent py-1.5 text-right text-[13px] text-ink outline-none placeholder:text-ink-4"
                placeholder={a.detected ? String(a.detected) : "auto"}
                value={v[a.id] ?? ""}
                aria-label={`1R for ${a.name}`}
                onChange={(e) => setV((x) => ({ ...x, [a.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
              />
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[10.5px] leading-[1.8] text-ink-4">
        What you risk on a normal trade on each account, e.g. $600 on the heavy eval, $300 on the rest. Leave one blank and it&apos;s worked out from that account&apos;s usual full loss. A
        risk typed on a single trade still wins for that trade.
      </p>
    </div>
  );
}
