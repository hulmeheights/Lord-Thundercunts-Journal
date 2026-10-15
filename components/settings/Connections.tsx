"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, FileUp, KeyRound, Link2, LoaderCircle, Pencil, RefreshCw, ShieldCheck, TriangleAlert, Unplug } from "lucide-react";
import type { BrokerAccount, ConnectionInfo } from "@/lib/types";
import { FIRMS, type Firm } from "@/lib/brokers/firms";
import { connectProjectX, connectTopstepShare, connectTradovate, disconnectBroker, renameAccount, setAccountIncluded } from "@/lib/actions/settings";
import { fmtMoney, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Segmented } from "@/components/ui/Segmented";

type Option = { key: string; title: string; price: string; free: boolean; firm?: Firm; blurb: string };

const OPTIONS: Option[] = [
  { key: "topstep-share", title: "TopstepX", price: "Free", free: true, firm: FIRMS.find((f) => f.id === "topstep-share"), blurb: "Auto-sync from each account's Share link. No login or API key." },
  { key: "import", title: "Lucid · Tradeify · any firm", price: "Free", free: true, blurb: "Drop the trade export (CSV) from Tradovate, Rithmic, TopstepX or NinjaTrader. Takes 10 seconds." },
  { key: "topstep", title: "TopstepX API", price: "$14.50/mo", free: false, firm: FIRMS.find((f) => f.id === "topstep"), blurb: "Official API. New accounts appear by themselves — no share links." },
  { key: "tradovate", title: "Tradovate API", price: "Paid add-on", free: false, firm: FIRMS.find((f) => f.id === "tradovate"), blurb: "Only for your own funded Tradovate account. Prop accounts can't use it." },
];

async function runSync(full: boolean) {
  const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ full }) });
  return (await res.json()) as { results?: { connection: string; ok: boolean; error?: string; newFills?: number }[] };
}

function ConnectForm({ option, onConnected }: { option: Option; onConnected: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [env, setEnv] = useState<"live" | "demo">("demo");

  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);
      const res =
        option.key === "topstep-share"
          ? await connectTopstepShare(String(fd.get("links") ?? ""))
          : option.key === "topstep"
            ? await connectProjectX({ firm: "topstep", userName: String(fd.get("user")), apiKey: String(fd.get("key")) })
            : await connectTradovate({
                username: String(fd.get("user")),
                password: String(fd.get("password")),
                cid: String(fd.get("cid")),
                sec: String(fd.get("sec")),
                environment: env,
              });
      if (res.error) setError(res.error);
      else onConnected();
    });

  return (
    <form action={submit} autoComplete="off" className="space-y-3">
      {option.firm && (
        <ol className="space-y-1.5 text-[13px] leading-relaxed text-ink-3">
          {option.firm.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-fill-2 text-[11px] font-bold text-ink-2">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {option.key === "topstep-share" && (
        <textarea name="links" required rows={3} placeholder={"https://www.topstepx.com/share/stats?share=12345678\nhttps://www.topstepx.com/share/stats?share=87654321"} className="field text-[13px]" spellCheck={false} />
      )}
      {option.key === "topstep" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="user" required placeholder="TopstepX username" className="field" autoComplete="off" spellCheck={false} />
          <input name="key" required type="password" placeholder="API key" className="field" autoComplete="new-password" spellCheck={false} />
        </div>
      )}
      {option.key === "tradovate" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="user" required placeholder="Tradovate username" className="field" autoComplete="off" spellCheck={false} />
            <input name="password" required type="password" placeholder="Password" className="field" autoComplete="new-password" />
            <input name="cid" required placeholder="CID" className="field" autoComplete="off" spellCheck={false} />
            <input name="sec" required type="password" placeholder="Secret" className="field" autoComplete="new-password" spellCheck={false} />
          </div>
          <Segmented size="sm" value={env} onChange={setEnv} options={[{ value: "demo", label: "Demo / prop" }, { value: "live", label: "Live" }]} />
        </>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-neg/10 px-3.5 py-2.5 text-[13px] text-neg">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? <LoaderCircle size={15} className="animate-spin" /> : option.free ? <Link2 size={15} /> : <KeyRound size={15} />}{" "}
        {pending ? "Checking…" : option.free ? "Connect" : "Connect securely"}
      </Button>
    </form>
  );
}

function AccountRow({ a }: { a: BrokerAccount }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a.name);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                await renameAccount(a.id, name);
                setEditing(false);
                router.refresh();
              });
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setEditing(false)} className="field h-8 text-[13px]" maxLength={80} />
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className="group flex max-w-full items-center gap-1.5 text-left">
            <span className="truncate text-[13.5px] font-medium">{a.name}</span>
            <Pencil size={11} className="shrink-0 text-ink-4 opacity-0 group-hover:opacity-100" />
          </button>
        )}
        <div className="text-[11.5px] text-ink-3">
          {a.active ? "Active" : "Inactive"}
          {a.balance !== null ? ` · ${fmtMoney(a.balance)}` : ""}
        </div>
      </div>
      <Toggle
        checked={a.included}
        onChange={(v) =>
          start(async () => {
            await setAccountIncluded(a.id, v);
            router.refresh();
          })
        }
        label={`Include ${a.name}`}
      />
    </div>
  );
}

export function Connections({ connections, accounts }: { connections: ConnectionInfo[]; accounts: BrokerAccount[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [adding, setAdding] = useState<string | null>(connections.length ? null : "topstep-share");
  const [syncing, setSyncing] = useState<"quick" | "full" | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const sync = async (full: boolean) => {
    setSyncing(full ? "full" : "quick");
    setSyncMsg(null);
    try {
      const r = (await runSync(full)).results ?? [];
      const err = r.find((x) => !x.ok);
      setSyncMsg(err ? err.error ?? "Sync failed" : `Synced · ${r.reduce((a, x) => a + (x.newFills ?? 0), 0)} new`);
    } catch {
      setSyncMsg("Sync failed — check your connection.");
    } finally {
      setSyncing(null);
      router.refresh();
    }
  };

  const importAccounts = accounts.filter((a) => a.connectionId === "import");

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-pos/20 bg-pos/[0.06] p-4 text-[13px] leading-relaxed text-ink-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-pos" />
        <div>
          <span className="font-semibold text-ink">Read-only by design.</span> Nothing here can place, change or cancel a trade. Any key you enter is verified, then
          encrypted with AES-256-GCM using a key that lives only in your Vercel settings — never in the database or the code. Disconnecting erases it instantly.
        </div>
      </div>

      {connections.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => sync(false)} disabled={!!syncing}>
              <RefreshCw size={14} className={syncing === "quick" ? "animate-spin" : ""} /> Sync now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => sync(true)} disabled={!!syncing}>
              {syncing === "full" && <LoaderCircle size={14} className="animate-spin" />} Full re-sync (1 year)
            </Button>
            {syncMsg && <span className="text-[12.5px] text-ink-3">{syncMsg}</span>}
          </div>
          {connections.map((c) => {
            const accs = accounts.filter((a) => a.connectionId === c.id);
            return (
              <div key={c.id} className="rounded-[24px] border border-line bg-fill p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[15.5px] font-semibold">{c.label}</div>
                    <div className={cn("inline-flex items-center gap-1 text-[12.5px]", c.status === "error" ? "text-orange" : "text-pos")}>
                      {c.status === "error" ? <TriangleAlert size={12} /> : <CircleCheck size={12} />}
                      {c.status === "error" ? "Needs attention" : "Connected"} · {c.usernameHint} · synced {timeAgo(c.lastSyncAt)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      start(async () => {
                        if (!confirm(`Disconnect ${c.label}? Stored keys are erased. Your synced trades and journal stay.`)) return;
                        await disconnectBroker(c.id);
                        router.refresh();
                      })
                    }
                  >
                    <Unplug size={14} /> Disconnect
                  </Button>
                </div>
                {c.lastError && <div className="mt-3 rounded-2xl bg-orange/10 px-3.5 py-2.5 text-[13px] text-orange">{c.lastError}</div>}
                {accs.length > 0 && <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-black/20">{accs.map((a) => <AccountRow key={a.id} a={a} />)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {importAccounts.length > 0 && (
        <div className="rounded-[24px] border border-line bg-fill p-4 sm:p-5">
          <div className="mb-1 text-[15.5px] font-semibold">Imported accounts</div>
          <div className="mb-3 text-[12.5px] text-ink-3">Accounts you&apos;ve added from export files. Rename them or hide them from your stats.</div>
          <div className="divide-y divide-line rounded-2xl border border-line bg-black/20">{importAccounts.map((a) => <AccountRow key={a.id} a={a} />)}</div>
        </div>
      )}

      <div>
        <div className="eyebrow mb-3">Add an account</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) =>
            o.key === "import" ? (
              <Link key={o.key} href="/trades?import=1" className="rounded-[22px] border border-line bg-fill p-4 text-left transition-colors hover:bg-fill-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[14.5px] font-semibold">
                    <FileUp size={16} className="text-cyan" /> {o.title}
                  </span>
                  <span className="rounded-full bg-pos/15 px-2 py-0.5 text-[11px] font-bold text-pos">{o.price}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{o.blurb}</p>
              </Link>
            ) : (
              <button
                key={o.key}
                onClick={() => setAdding(adding === o.key ? null : o.key)}
                className={cn("rounded-[22px] border p-4 text-left transition-colors", adding === o.key ? "border-cyan/50 bg-cyan/[0.05]" : "border-line bg-fill hover:bg-fill-2")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14.5px] font-semibold">{o.title}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", o.free ? "bg-pos/15 text-pos" : "bg-fill-3 text-ink-2")}>{o.price}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{o.blurb}</p>
              </button>
            ),
          )}
        </div>
        {adding && (
          <div className="mt-4 rounded-[24px] border border-line bg-fill p-4 sm:p-5">
            <ConnectForm
              key={adding}
              option={OPTIONS.find((o) => o.key === adding)!}
              onConnected={async () => {
                setAdding(null);
                await sync(true);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
