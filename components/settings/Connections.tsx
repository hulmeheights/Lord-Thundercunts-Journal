"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BrokerAccount, ConnectionInfo } from "@/lib/types";
import { FIRMS, type Firm } from "@/lib/brokers/firms";
import { connectProjectX, connectTopstepShare, connectTradovate, disconnectBroker, renameAccount, setAccountIncluded } from "@/lib/actions/settings";
import { fmtMoney, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, buttonClass } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Seg } from "@/components/m/Seg";
import { Dot, Tag } from "@/components/m";
import { lineInput, Note, SRow, Sub } from "./ui";

type Key = "tradovate-login" | "topstep-share" | "topstep" | "import" | "tradovate";
type Option = { key: Key; title: string; who: string; cost: string; firm?: Firm; blurb: string };

const OPTIONS: Option[] = [
  {
    key: "tradovate-login",
    title: "Log in with Tradovate",
    who: "Lucid · Tradeify · any Tradovate prop account",
    cost: "Free · beta",
    blurb: "You log in on Tradovate's own page and allow view-only; your password never comes here. One paste, then it syncs by itself.",
  },
  {
    key: "topstep",
    title: "TopstepX",
    who: "Username + API key",
    cost: "Same key as Tradecopia",
    firm: FIRMS.find((f) => f.id === "topstep"),
    blurb: "Exactly what Tradecopia asks for. New Combines and Express accounts show up by themselves.",
  },
  {
    key: "topstep-share",
    title: "TopstepX share links",
    who: "No key at all",
    cost: "Free",
    firm: FIRMS.find((f) => f.id === "topstep-share"),
    blurb: "Paste each account's Share link. Read from TopstepX's public stats, nothing to log in to.",
  },
  {
    key: "import",
    title: "Import a file",
    who: "Tradovate · Rithmic · NinjaTrader · TopstepX",
    cost: "Free",
    blurb: "Drop a trade export (CSV). Ten seconds, works for every firm, nothing connected.",
  },
  {
    key: "tradovate",
    title: "Tradovate API key",
    who: "Advanced · your own funded live account",
    cost: "Tradovate add-on",
    firm: FIRMS.find((f) => f.id === "tradovate"),
    blurb: "Your own CID and secret from Tradovate's API add-on. Prop accounts should use Log in with Tradovate instead.",
  },
];

async function runSync(full: boolean) {
  const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ full }) });
  return (await res.json()) as { results?: { connection: string; ok: boolean; error?: string; newFills?: number }[] };
}

function Steps({ firm }: { firm: Firm }) {
  return (
    <ol className="mb-6 space-y-2.5">
      {firm.steps.map((s, i) => (
        <li key={i} className="grid grid-cols-[2rem_1fr] font-mono text-[11px] leading-[1.85] text-ink-2">
          <span className="text-gold">{String(i + 1).padStart(2, "0")}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

/**
 * Two steps, because Tradovate only lets this sign-in return to a localhost
 * address: sign in on their page (new tab), then paste the address of the page
 * that didn't load. After that it renews itself on every sync.
 */
function TradovateLogin({ initialEnv = "demo" }: { initialEnv?: "demo" | "live" }) {
  const router = useRouter();
  const [env, setEnv] = useState<"demo" | "live">(initialEnv);
  const [opened, setOpened] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tradovate/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pasted }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; accounts?: number; trades?: number | null; syncError?: string | null; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Tradovate sign-in failed.");
      setDone(
        `● Connected · ${j.accounts ?? 0} account${j.accounts === 1 ? "" : "s"}` +
          (j.syncError ? ` · first sync: ${j.syncError}` : j.trades !== null && j.trades !== undefined ? ` · ${j.trades} trades synced` : ""),
      );
      setPasted("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tradovate sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const step = "grid grid-cols-[2rem_1fr] font-mono text-[11px] leading-[1.85] text-ink-2";
  if (done) return <Note tone="pos">{done}. From now on it syncs by itself, every night and whenever you open the journal.</Note>;

  return (
    <div>
      <ol className="mb-7 space-y-2.5">
        <li className={step}>
          <span className="text-gold">01</span>Press the button. Tradovate&apos;s own sign-in opens in a new tab (trader.tradovate.com, the same page Tradecopia uses; it will say &ldquo;to continue to NinjaTrader MCP&rdquo;). Sign in with the login your prop firm gave you and allow view-only.
        </li>
        <li className={step}>
          <span className="text-gold">02</span>That tab then lands on a page that won&apos;t load (it says localhost). That&apos;s expected: the address holds a one-time code.
        </li>
        <li className={step}>
          <span className="text-gold">03</span>Copy that whole address, come back to this tab, paste it below and press Finish. Do it within ten minutes.
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <a href={`/api/tradovate/connect?env=${env}`} target="_blank" rel="noopener" onClick={() => setOpened(true)} className={buttonClass(opened ? "secondary" : "primary", "lg")}>
          {opened ? "Open sign-in again ↗" : "Log in with Tradovate ↗"}
        </a>
        <Seg value={env} onChange={setEnv} options={[{ value: "demo", label: "Prop / eval" }, { value: "live", label: "Live" }]} />
      </div>
      <div className={cn("mt-8 transition-opacity duration-500", opened ? "opacity-100" : "opacity-60")}>
        <label className="mb-2 block font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase" htmlFor="nt-paste">
          The address from that tab
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <input
            id="nt-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pasted.trim() && !busy && finish()}
            placeholder="http://localhost:8765/callback?code=…"
            className={cn(lineInput, "min-w-[240px] flex-1")}
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="primary" onClick={finish} disabled={busy || !pasted.trim()}>
            {busy ? "Connecting…" : "Finish"}
          </Button>
        </div>
        {error && <Note tone="warn" className="mt-4">{error}</Note>}
      </div>
      <p className="mt-6 max-w-[60ch] font-mono text-[10.5px] leading-[1.8] text-ink-4">
        One time only. Tradovate&apos;s sign-in lasts about a day and every sync renews it, so the nightly sync keeps it alive on its own.
      </p>
      <p className="mt-3 max-w-[60ch] font-mono text-[10.5px] leading-[1.8] text-ink-4">
        <span className="text-gold">◆</span> Tradovate grants this sign-in its standard NinjaTrader MCP permissions, which include orders. That set is fixed and can&apos;t be
        narrowed. The journal never uses it: any tool that could place, change or close a trade is refused in code before a request is sent, and the
        sign-in is stored sealed with AES-256-GCM. Disconnect erases it.
      </p>
    </div>
  );
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
            : await connectTradovate({ username: String(fd.get("user")), password: String(fd.get("password")), cid: String(fd.get("cid")), sec: String(fd.get("sec")), environment: env });
      if (res.error) setError(res.error);
      else onConnected();
    });

  return (
    <form action={submit} autoComplete="off">
      {option.firm && <Steps firm={option.firm} />}
      {option.key === "topstep-share" && (
        <textarea
          name="links"
          required
          rows={3}
          aria-label="Share links"
          placeholder={"https://www.topstepx.com/share/stats?share=12345678\nhttps://www.topstepx.com/share/stats?share=87654321"}
          className={cn(lineInput, "resize-none leading-[1.9]")}
          spellCheck={false}
        />
      )}
      {option.key === "topstep" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <input name="user" required placeholder="TopstepX username" aria-label="TopstepX username" className={lineInput} autoComplete="off" spellCheck={false} />
          <input name="key" required type="password" placeholder="API key" aria-label="API key" className={lineInput} autoComplete="new-password" spellCheck={false} />
        </div>
      )}
      {option.key === "tradovate" && (
        <>
          <div className="grid gap-6 sm:grid-cols-2">
            <input name="user" required placeholder="Tradovate username" aria-label="Tradovate username" className={lineInput} autoComplete="off" spellCheck={false} />
            <input name="password" required type="password" placeholder="Password" aria-label="Password" className={lineInput} autoComplete="new-password" />
            <input name="cid" required placeholder="CID" aria-label="CID" className={lineInput} autoComplete="off" spellCheck={false} />
            <input name="sec" required type="password" placeholder="Secret" aria-label="Secret" className={lineInput} autoComplete="new-password" spellCheck={false} />
          </div>
          <Seg className="mt-6" value={env} onChange={setEnv} options={[{ value: "demo", label: "Demo / prop" }, { value: "live", label: "Live" }]} />
        </>
      )}
      {error && <Note tone="warn" className="mt-5">{error}</Note>}
      <Button type="submit" variant="primary" className="mt-7" disabled={pending}>
        {pending ? "Checking…" : "Connect"}
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
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 pl-[2rem]">
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
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setEditing(false)} className={lineInput} maxLength={80} aria-label="Account name" />
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className="group max-w-full truncate text-left font-mono text-[11.5px] text-ink" title="Rename">
            {a.name} <span className="text-ink-4 opacity-0 transition-opacity group-hover:opacity-100">· rename</span>
          </button>
        )}
        <div className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-4">
          {a.active ? "Active" : "Inactive"}
          {a.balance !== null ? ` · ${fmtMoney(a.balance)}` : ""}
          {!a.included && " · hidden from stats"}
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

export type ConnectNotice = { kind: "connected" | "cancelled" | "expired" | "error"; n?: number; msg?: string } | null;

export function Connections({ connections, accounts, notice = null }: { connections: ConnectionInfo[]; accounts: BrokerAccount[]; notice?: ConnectNotice }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [adding, setAdding] = useState<Key | null>(connections.length ? null : "tradovate-login");
  const [syncing, setSyncing] = useState<"quick" | "full" | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const sync = async (full: boolean) => {
    setSyncing(full ? "full" : "quick");
    setSyncMsg(null);
    try {
      const r = (await runSync(full)).results ?? [];
      const err = r.find((x) => !x.ok);
      setSyncMsg(err ? (err.error ?? "Sync failed") : `Synced · ${r.reduce((a, x) => a + (x.newFills ?? 0), 0)} new`);
    } catch {
      setSyncMsg("Sync failed. Check your connection.");
    } finally {
      setSyncing(null);
      router.refresh();
    }
  };

  const importAccounts = accounts.filter((a) => a.connectionId === "import");

  return (
    <div>
      {notice && (
        <div className="mb-10 border-l border-gold py-1 pl-5">
          {notice.kind === "connected" ? (
            <Note tone="pos">
              ● Tradovate connected · {notice.n ?? 0} account{notice.n === 1 ? "" : "s"} found. Your history is syncing.
            </Note>
          ) : notice.kind === "cancelled" ? (
            <Note>Tradovate sign-in was cancelled. Nothing was connected.</Note>
          ) : notice.kind === "expired" ? (
            <Note tone="warn">That sign-in took too long or came from another browser. Start again from here.</Note>
          ) : (
            <Note tone="warn">{notice.msg || "Tradovate sign-in failed."}</Note>
          )}
        </div>
      )}

      <p className="mb-12 max-w-[64ch] font-mono text-[11.5px] leading-[1.9] text-ink-2">
        <span className="text-ink">Read-only by design.</span> Nothing here can place, change or cancel a trade. Keys are checked, then sealed with AES-256-GCM using a key
        that lives only in your Vercel settings, never in the database or the code. Disconnect and they&apos;re erased.
      </p>

      {connections.length > 0 && (
        <div className="mb-16">
          <Sub
            aside={
              <span className="flex items-center gap-5">
                {syncMsg && <span className="font-mono text-[10.5px] text-ink-3">{syncMsg}</span>}
                <button onClick={() => sync(false)} disabled={!!syncing} className="font-mono text-[9.5px] tracking-[0.3em] text-ink-2 uppercase hover:text-ink disabled:opacity-40">
                  {syncing === "quick" ? "Syncing…" : "↻ Sync now"}
                </button>
                <button onClick={() => sync(true)} disabled={!!syncing} className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase hover:text-ink disabled:opacity-40">
                  {syncing === "full" ? "Re-syncing…" : "Full year"}
                </button>
              </span>
            }
          >
            Connected
          </Sub>
          {connections.map((c, i) => {
            const accs = accounts.filter((a) => a.connectionId === c.id);
            const bad = c.status === "error";
            return (
              <div key={c.id}>
                <div className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-4 gap-y-2 border-b border-line py-5">
                  <span className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="font-serif text-[clamp(1.2rem,2.2vw,1.55rem)] font-light">{c.label}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 font-mono text-[10px] tracking-[0.08em] text-ink-3">
                      <span className={cn("inline-flex items-center gap-2", bad ? "text-ink" : "text-pos")}>
                        {bad ? <span className="text-gold">◆</span> : <Dot />}
                        {bad ? "Needs attention" : "Connected"}
                      </span>
                      {c.usernameHint && <span>· {c.usernameHint}</span>}
                      <span>· synced {timeAgo(c.lastSyncAt)}</span>
                    </div>
                    {c.lastError && <Note tone="warn" className="mt-3">{c.lastError}</Note>}
                    {bad && c.id.startsWith("ntmcp") && (
                      <div className="mt-6 border-l border-gold pl-5">
                        <TradovateLogin initialEnv={c.environment === "live" ? "live" : "demo"} />
                      </div>
                    )}
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
                    Disconnect
                  </Button>
                </div>
                {accs.map((a) => (
                  <AccountRow key={a.id} a={a} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {importAccounts.length > 0 && (
        <div className="mb-16">
          <Sub>Imported accounts</Sub>
          {importAccounts.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
        </div>
      )}

      <Sub>Add an account</Sub>
      {OPTIONS.map((o, i) => {
        const open = adding === o.key;
        const head = (
          <>
            <span className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="block font-serif text-[clamp(1.25rem,2.4vw,1.75rem)] leading-[1.2] font-light">{o.title}</span>
              <span className="mt-1.5 block font-mono text-[10px] tracking-[0.12em] text-ink-4 uppercase">{o.who}</span>
            </span>
            <span className="hidden max-w-[44ch] font-mono text-[11.5px] leading-[1.85] text-ink-2 md:block">{o.blurb}</span>
            <span className="flex items-center gap-4">
              <Tag tone={o.cost.startsWith("Free") ? "pos" : o.key === "topstep" ? "gold" : undefined}>{o.cost}</Tag>
              <span className="font-mono text-[12px] text-ink-4">{o.key === "import" ? "→" : open ? "−" : "+"}</span>
            </span>
          </>
        );
        const cls = "m-row grid w-full grid-cols-[2rem_1fr_auto] items-baseline gap-x-4 gap-y-2 border-b border-line py-6 text-left md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] md:gap-x-8";
        return (
          <div key={o.key}>
            {o.key === "import" ? (
              <Link href="/trades?import=1" className={cls}>
                {head}
              </Link>
            ) : (
              <button onClick={() => setAdding(open ? null : o.key)} aria-expanded={open} className={cls}>
                {head}
              </button>
            )}
            {open && (
              <div className="border-b border-line py-8 pl-[2rem] md:pl-[calc(2rem+2rem)]">
                <p className="mb-6 max-w-[60ch] font-mono text-[11.5px] leading-[1.85] text-ink-2 md:hidden">{o.blurb}</p>
                {o.key === "tradovate-login" ? (
                  <TradovateLogin />
                ) : (
                  <ConnectForm
                    key={o.key}
                    option={o}
                    onConnected={async () => {
                      setAdding(null);
                      await sync(true);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
