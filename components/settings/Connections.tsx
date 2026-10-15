"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, KeyRound, LoaderCircle, Lock, RefreshCw, ShieldCheck, TriangleAlert, Unplug } from "lucide-react";
import type { BrokerAccount, ConnectionInfo, Provider } from "@/lib/types";
import { connectTopstepX, connectTradovate, disconnectBroker, setAccountIncluded } from "@/lib/actions/settings";
import { fmtMoney, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Segmented } from "@/components/ui/Segmented";

const INFO: Record<Provider, { name: string; color: string; blurb: string; steps: string[] }> = {
  topstepx: {
    name: "TopstepX",
    color: "#64d2ff",
    blurb: "Topstep's own platform (powered by ProjectX). Full history back-fills automatically.",
    steps: [
      "Subscribe to ProjectX API Access at dashboard.projectx.com (use code “topstep” for 50% off).",
      "In TopstepX → Settings → API, click “Add Link”, then “Add API Key”.",
      "Paste your TopstepX username and the API key below.",
    ],
  },
  tradovate: {
    name: "Tradovate",
    color: "#bf5af2",
    blurb: "Tradovate accounts. Fills sync daily; older history can be added manually.",
    steps: [
      "In Tradovate → Application Settings → Add-Ons, enable API Access.",
      "Open the API Access tab → Generate API Key. Copy the CID and Secret.",
      "Enter your Tradovate username, password, CID and Secret below.",
    ],
  },
};

function SyncButtons({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<"quick" | "full" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (full: boolean) => {
    setBusy(full ? "full" : "quick");
    setMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ full }) });
      const json = (await res.json()) as { results?: { ok: boolean; error?: string; newFills?: number; trades?: number; skipped?: boolean }[] };
      const r = json.results ?? [];
      const err = r.find((x) => !x.ok);
      setMsg(err ? err.error ?? "Sync failed" : `Synced · ${r.reduce((a, x) => a + (x.newFills ?? 0), 0)} new fills`);
      onDone();
    } catch {
      setMsg("Sync failed — check your connection.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => run(false)} disabled={!!busy}>
        <RefreshCw size={14} className={busy === "quick" ? "animate-spin" : ""} /> Sync now
      </Button>
      <Button size="sm" variant="ghost" onClick={() => run(true)} disabled={!!busy}>
        {busy === "full" && <LoaderCircle size={14} className="animate-spin" />} Full re-sync
      </Button>
      {msg && <span className="text-[12.5px] text-ink-3">{msg}</span>}
    </div>
  );
}

function ConnectForm({ provider, onConnected }: { provider: Provider; onConnected: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [env, setEnv] = useState<"live" | "demo">("live");
  const [advanced, setAdvanced] = useState(false);
  return (
    <form
      autoComplete="off"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;
        start(async () => {
          setError(null);
          const res =
            provider === "topstepx"
              ? await connectTopstepX({ userName: String(f.get("user")), apiKey: String(f.get("key")), host: String(f.get("host") || "") || undefined })
              : await connectTradovate({
                  username: String(f.get("user")),
                  password: String(f.get("password")),
                  cid: String(f.get("cid")),
                  sec: String(f.get("sec")),
                  environment: env,
                });
          if (res.error) setError(res.error);
          else {
            form.reset();
            onConnected();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="user" required placeholder={`${INFO[provider].name} username`} className="field" autoComplete="off" spellCheck={false} />
        {provider === "topstepx" ? (
          <input name="key" required type="password" placeholder="API key" className="field" autoComplete="new-password" spellCheck={false} />
        ) : (
          <input name="password" required type="password" placeholder="Password" className="field" autoComplete="new-password" />
        )}
        {provider === "tradovate" && (
          <>
            <input name="cid" required placeholder="CID" className="field" autoComplete="off" spellCheck={false} />
            <input name="sec" required type="password" placeholder="Secret" className="field" autoComplete="new-password" spellCheck={false} />
          </>
        )}
      </div>
      {provider === "tradovate" && <Segmented size="sm" value={env} onChange={setEnv} options={[{ value: "live", label: "Live" }, { value: "demo", label: "Demo / Sim" }]} />}
      {provider === "topstepx" && (
        <div>
          <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-[12px] font-semibold text-ink-3 hover:text-ink">
            {advanced ? "Hide" : "Other ProjectX firm?"}
          </button>
          {advanced && <input name="host" placeholder="https://api.topstepx.com" className="field mt-2" spellCheck={false} />}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-neg/10 px-3.5 py-2.5 text-[13px] text-neg">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />} {pending ? "Verifying…" : "Connect securely"}
      </Button>
    </form>
  );
}

export function Connections({ connections, accounts }: { connections: ConnectionInfo[]; accounts: BrokerAccount[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [firstSync, setFirstSync] = useState<Provider | null>(null);

  const afterConnect = async (p: Provider) => {
    setEditing(null);
    setFirstSync(p);
    try {
      await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ full: true }) });
    } finally {
      setFirstSync(null);
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-pos/20 bg-pos/[0.06] p-4 text-[13px] leading-relaxed text-ink-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-pos" />
        <div>
          <span className="font-semibold text-ink">Read-only by design.</span> Credentials are verified, then encrypted with AES-256-GCM using a key that
          lives only in your Vercel environment — never in the database or the code. The app can only call history endpoints; it has no ability to place,
          modify or cancel orders. Disconnecting erases the credentials instantly.
        </div>
      </div>
      {(Object.keys(INFO) as Provider[]).map((p) => {
        const c = connections.find((x) => x.provider === p);
        const accs = accounts.filter((a) => a.provider === p);
        const info = INFO[p];
        return (
          <div key={p} className="rounded-[24px] border border-line bg-fill p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: `${info.color}22`, color: info.color }}>
                  <Lock size={19} />
                </div>
                <div>
                  <div className="text-[16px] font-semibold">{info.name}</div>
                  <div className="text-[12.5px] text-ink-3">
                    {c ? (
                      <span className={cn("inline-flex items-center gap-1", c.status === "error" ? "text-orange" : "text-pos")}>
                        {c.status === "error" ? <TriangleAlert size={12} /> : <CircleCheck size={12} />}
                        {c.status === "error" ? "Needs attention" : "Connected"} · {c.usernameHint} · synced {timeAgo(c.lastSyncAt)}
                      </span>
                    ) : (
                      info.blurb
                    )}
                  </div>
                </div>
              </div>
              {c && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p ? null : p)}>
                    Update keys
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      start(async () => {
                        if (!confirm(`Disconnect ${info.name}? Stored credentials are erased. Your synced trades and journal stay.`)) return;
                        await disconnectBroker(p);
                        router.refresh();
                      })
                    }
                  >
                    <Unplug size={14} /> Disconnect
                  </Button>
                </div>
              )}
            </div>

            {c?.lastError && <div className="mt-3 rounded-2xl bg-orange/10 px-3.5 py-2.5 text-[13px] text-orange">{c.lastError}</div>}
            {firstSync === p && (
              <div className="mt-3 flex items-center gap-2 text-[13px] text-cyan">
                <LoaderCircle size={14} className="animate-spin" /> Importing your history — this can take a minute…
              </div>
            )}

            {c && (
              <div className="mt-4 space-y-3">
                <SyncButtons onDone={() => router.refresh()} />
                {accs.length > 0 && (
                  <div className="divide-y divide-line rounded-2xl border border-line">
                    {accs.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-medium">{a.name}</div>
                          <div className="text-[11.5px] text-ink-3">
                            {a.active ? "Active" : "Inactive"}
                            {a.isSim ? " · Sim" : ""}
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
                    ))}
                  </div>
                )}
              </div>
            )}

            {(!c || editing === p) && (
              <div className="mt-4 space-y-4">
                <ol className="space-y-1.5 text-[13px] leading-relaxed text-ink-3">
                  {info.steps.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-fill-2 text-[11px] font-bold text-ink-2">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
                <ConnectForm provider={p} onConnected={() => afterConnect(p)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
