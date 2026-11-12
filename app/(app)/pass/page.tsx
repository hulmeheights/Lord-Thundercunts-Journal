import { passState } from "@/lib/data/pass";
import { runnerStatus } from "@/lib/bot/runner";
import { getSettings } from "@/lib/data/settings";
import { cn } from "@/lib/cn";
import { Meta, PageHead, Section } from "@/components/m";
import { PassAccounts, PassSwitch } from "@/components/pass/PassAccounts";
import { SESSION_NAME } from "@/lib/pass/rules";
import { Copy } from "@/components/autopilot/Copy";
import { CopyScript } from "@/components/pass/CopyScript";
import { PASS_PINE } from "@/lib/pass/pineScript";
import { headers } from "next/headers";

export const metadata = { title: "Pass plan" };

const money = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

export default async function PassPage() {
  const [p, runner, settings, h] = await Promise.all([passState(), runnerStatus(), getSettings(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "lord-thundercunts-journal.vercel.app";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const tz = settings.profile.timezone;
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const on = p.accounts.filter((a) => a.enabled);
  const closed = p.trades.filter((t) => t.status === "closed" && t.pnl !== null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const gw = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const gl = -closed.filter((t) => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
  return (
    <>
      <PageHead
        eyebrow="08 — Pass plan"
        title={
          <>
            Pass the evals, <em>account by account</em>.
          </>
        }
        sub="MNQ Pass Plan, scripts C and D. One TradingView alert sends every session's signal (Asia, London, New York) with its 4H bias and value area; each account decides by its own stage (eval, funded or pre-live) and script, and your Mac places the orders."
        meta={<Meta value={p.on ? "On" : "Off"} tone={p.on ? "pos" : null} caption={`${on.length} ${on.length === 1 ? "account" : "accounts"} on · Mac ${runner.paired ? (runner.lastSeen ? `seen ${when(runner.lastSeen)}` : "paired") : "not set up"}`} />}
      />

      <Section id="switch" n={1} label="The switch" lead={<>On or <em>off</em>.</>}>
        <PassSwitch on={p.on} />
        <p className="mt-5 max-w-2xl font-mono text-[10.5px] leading-[1.8] text-ink-4">
          Separate from Autopilot&apos;s switch. Off stops new trades; open ones keep their stop and target and still get their time exit. Your Mac must be running the bot (Autopilot → Your Mac), version 4.1 or later, and the TradingView alert must be active.
        </p>
      </Section>

      <Section id="tradingview" n={2} label="TradingView" lead={<>One alert for <em>every</em> account.</>}>
        <ol className="max-w-3xl list-decimal space-y-2 pl-5 font-mono text-[11px] leading-[1.8] text-ink-3">
          <li>
            Tap <b className="font-normal text-ink">Copy the script</b> below. In TradingView: Pine Editor → New → select everything and paste over it → Save as <b className="font-normal text-ink">Pass Plan 1 - All signals, no filter [1m]</b> → Add to chart, on <b className="font-normal text-ink">CME_MINI:MNQ1!</b>, <b className="font-normal text-ink">1 minute</b>.
          </li>
          <li>In the script&apos;s settings, put your Webhook Secret: the same one as the SOR script (BOT_WEBHOOK_SECRET in Vercel).</li>
          <li>
            Create an alert: Condition = <b className="font-normal text-ink">Pass Plan 1 - All signals, no filter [1m]</b> → <b className="font-normal text-ink">alert() function calls only</b> (not &quot;Order fills&quot;), Expiration = open-ended, Notifications → Webhook URL below, and tick Notify in app (so you hear if it ever stops). Leave the Message box as it is.
          </li>
          <li>It&apos;s a second alert next to the SOR one: both can run at once. It sends every signal with its filter results; each account here decides (script A: all, C: filtered only, D: all in eval, filtered once funded). The filtered script (Pass Plan 2) is only for the Strategy Tester: no alert on it.</li>
        </ol>
        <div className="mt-5">
          <CopyScript code={PASS_PINE} />
        </div>
        <div className="mt-4 max-w-3xl">
          <Copy label="Webhook URL (the same as the SOR alert)" value={`${origin}/api/bot/webhook`} />
        </div>
      </Section>

      <Section id="accounts" n={3} label="Accounts" lead={<>Each account knows its <em>stage</em>.</>}>
        <PassAccounts accounts={p.accounts} options={runner.accounts ?? []} />
        <p className="mt-6 max-w-3xl font-mono text-[10.5px] leading-[1.8] text-ink-4">
          When an account passes, hits its payout or blows, the card switches itself off and your phone gets a push. When Topstep gives you the funded account (or Lucid moves you to pre-live), set the card&apos;s stage and new account and switch it back on: it starts that stage from zero. Topstep cards trade from your Mac; Lucid cards push you each trade to place yourself (stop, target and the time to close).
        </p>
      </Section>

      <Section id="book" n={4} label="The book" lead={<>Every session, every <em>account</em>.</>}>
        <div className="mb-4 font-mono text-[11px] text-ink-3">
          {closed.length} closed · {closed.length ? Math.round((wins.length / closed.length) * 100) : 0}% won · PF {gl > 0 ? (gw / gl).toFixed(2) : "—"} · net {money(gw - gl)}
        </div>
        <ul>
          {p.trades.length === 0 && <li className="font-mono text-[11px] text-ink-4">Nothing yet. The first decision comes at the next session.</li>}
          {p.trades.map((t) => (
            <li key={t.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-line py-2 font-mono text-[11px]", t.status === "skipped" && "opacity-55")}>
              <span className="truncate text-ink-2">
                {when(t.enteredAt)} · {SESSION_NAME[t.session]} · {t.account} · {t.stage}
                {t.mode !== "live" && <span className="text-ink-4"> ({t.mode === "dry" ? "practice" : "yours"})</span>}
              </span>
              <span className={cn("num text-right", (t.pnl ?? 0) > 0 ? "text-pos" : (t.pnl ?? 0) < 0 ? "text-neg" : "text-ink-4")}>
                {t.status === "closed" ? money(t.pnl ?? 0) : t.status === "open" ? "open" : t.status === "pending" ? "placing" : t.status}
              </span>
              <span className="col-span-2 truncate text-[10px] text-ink-4">
                {t.status === "skipped" || t.status === "error" ? t.reason : `${t.dir} ${t.qty} @ ${t.entry} · SL ${t.stop} · TP ${t.target}${t.exitReason ? ` · ${t.exitReason === "time" ? "time exit" : t.exitReason}` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="rules" n={5} label="The rules" lead={<>What the bot <em>does</em>.</>}>
        <div className="max-w-3xl space-y-3 font-mono text-[11px] leading-[1.8] text-ink-3">
          <p>
            <b className="font-normal text-ink">Asia</b> · 20:00 New York bar closes → LONG · out by 02:59. No Asia trade on Friday or Saturday evenings.
            <br />
            <b className="font-normal text-ink">London</b> · 03:30 bar closes above the 03:01 open → SHORT, otherwise LONG (against the first 30 minutes) · out by 09:39.
            <br />
            <b className="font-normal text-ink">New York</b> · 10:10 bar closes at or above the 09:41 open → LONG, otherwise SHORT (with the first 30 minutes) · out by 16:09.
          </p>
          <p>Stop = the stage&apos;s risk (less if the daily or trailing loss limit has less room). Target = what&apos;s left of today&apos;s goal. An account stops for the day at its goal, its daily loss limit or under $25 of room.</p>
          <p>
            Filters (script C always, script D once funded): the last finished 4H candle&apos;s body must point the trade&apos;s way (Asia: 14:00–18:00, London: 22:00–02:00, New York: 02:00–06:00), and price must be outside the day&apos;s 70% value area (from 20:00 New York). The script works both out on your chart and sends them with each signal.
          </p>
          <p className="text-ink-4">Backtested Nov 2019 – Nov 2026; expect live pass rates a few points lower. Start on Practice, then one or two evals.</p>
        </div>
      </Section>
    </>
  );
}
