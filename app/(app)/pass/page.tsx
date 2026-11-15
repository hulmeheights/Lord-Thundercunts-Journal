import { passState } from "@/lib/data/pass";
import { runnerStatus } from "@/lib/bot/runner";
import { getSettings } from "@/lib/data/settings";
import { cn } from "@/lib/cn";
import { Dot, Meta, PageHead, Section } from "@/components/m";
import { ReadyPush } from "@/components/pass/ReadyPush";
import { HB_NAME } from "@/lib/pass/heartbeat";
import { SectionIndex } from "@/components/m/SectionIndex";
import { PassAccounts, PassSwitch } from "@/components/pass/PassAccounts";
import { SESSION_NAME, SOR_SESSIONS } from "@/lib/pass/rules";
import { Copy } from "@/components/autopilot/Copy";
import { Runner } from "@/components/autopilot/Runner";
import { CopyScript } from "@/components/pass/CopyScript";
import { PASS_PINE, PASS_PINE_NAME, SNIPER_PINE, SNIPER_PINE_NAME } from "@/lib/pass/pineScript";
import { headers } from "next/headers";
import { NewsMinutes } from "@/components/autopilot/NewsMinutes";
import { setPassNewsMinutes } from "@/lib/actions/pass";
import { windows } from "@/lib/bot/news";
import { newsAround, newsFreshness, refreshNews } from "@/lib/bot/newsFeed";

export const metadata = { title: "Pass plan" };

const money = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;
/** The Mac bot this page needs: 5.0 brought SOR's own prices and the goal guard. */
const NEEDS = 5;

export default async function PassPage() {
  await refreshNews();
  const [p, runner, settings, h, upcoming, fresh] = await Promise.all([passState(), runnerStatus(), getSettings(), headers(), newsAround(new Date(Date.now() - 60 * 60_000), new Date(Date.now() + 8 * 86_400_000)), newsFreshness()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "lord-thundercunts-journal.vercel.app";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const tz = settings.profile.timezone;
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const blackouts = windows(upcoming, p.newsMinutes);
  const nyTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const local = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const on = p.accounts.filter((a) => a.enabled);
  const live = on.filter((a) => a.mode === "live");
  const closed = p.trades.filter((t) => t.status === "closed" && t.pnl !== null);
  const tally = (rows: typeof closed) => {
    const wins = rows.filter((t) => (t.pnl ?? 0) > 0);
    const gw = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const gl = -rows.filter((t) => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
    return `${rows.length} closed · ${rows.length ? Math.round((wins.length / rows.length) * 100) : 0}% won · PF ${gl > 0 ? (gw / gl).toFixed(2) : "—"} · net ${money(gw - gl)}`;
  };
  const open = p.trades.filter((t) => t.status === "open" || t.status === "pending");
  // The track record (every signal, no account) and your own accounts are counted apart.
  const tracked = closed.filter((t) => t.stage === "track");
  const mine = closed.filter((t) => t.stage !== "track");
  const version = Number(/bot (\d+(?:\.\d+)?)/.exec(runner.info ?? "")?.[1] ?? NaN);
  const oldBot = runner.paired && Number.isFinite(version) && version < NEEDS;
  const sorCards = on.filter((a) => a.cfg.sorOn);
  // The three things every trade depends on, as lights.
  const hb = p.heartbeat.C;
  const sn = p.heartbeat.SNIPER;
  const beat = (h: typeof hb, name: string) =>
    h.state === "never"
      ? { tone: "mute" as const, text: `No heartbeat yet from ${name}: paste the updated script into TradingView` }
      : h.state === "missed"
        ? { tone: "gold" as const, text: `${name}: missed its ${h.dueSession ? HB_NAME[h.dueSession] : ""} heartbeat (due ${h.dueAt ? when(h.dueAt) : ""}). Check the alert in TradingView` }
        : { tone: "pos" as const, text: `${name} alive · last heartbeat ${h.at ? when(h.at) : ""}${h.state === "waiting" ? " · next one due now" : ""}` };
  const lights = [
    { label: "TradingView", ...beat(hb, "Main script") },
    ...(on.some((a) => a.cfg.sniperOn) || sn.state !== "never" ? [{ label: "Sniper", ...beat(sn, "Sniper script") }] : []),
    {
      label: "Your Mac",
      tone: runner.online ? ("pos" as const) : runner.paired ? ("gold" as const) : ("mute" as const),
      text: runner.online ? `Connected${runner.info ? ` · ${runner.info}` : ""}` : runner.paired ? `Not connected right now · last seen ${runner.lastSeen ? when(runner.lastSeen) : "never"} (between sessions it only checks in every few minutes)` : "Not set up",
    },
    {
      label: "Topstep",
      tone: runner.accountsAt && Date.now() - Date.parse(runner.accountsAt) < 36 * 3600_000 ? ("pos" as const) : ("mute" as const),
      text: runner.accountsAt ? `${runner.accounts.length} ${runner.accounts.length === 1 ? "account" : "accounts"} read from your Mac · ${when(runner.accountsAt)}` : "No accounts read yet",
    },
  ];
  const sniperCards = on.filter((a) => a.cfg.sniperOn);
  return (
    <>
      <SectionIndex ids={["switch", "mac", "tradingview", "accounts", "news", "now", "book", "rules", "log"]} />
      <PageHead
        eyebrow="08 — Pass plan"
        title={
          <>
            Pass the evals, <em>account by account</em>.
          </>
        }
        sub="One TradingView alert sends every C trade (Asia, London, New York) and every safe SOR trade. Each account decides by its own stage: its size, its stop, and a target that is exactly what that account still needs today. Your Mac places the orders and guards each account's target until the trade is closed."
        meta={<Meta value={p.on ? "On" : "Off"} tone={p.on ? "pos" : null} caption={`${on.length} ${on.length === 1 ? "account" : "accounts"} on · ${live.length} on real orders · Mac ${runner.online ? "connected" : runner.paired ? "not connected" : "not set up"}`} />}
      />

      <ul className="reveal -mt-2 max-w-3xl border-y border-line" aria-label="Is everything ready">
        {lights.map((l) => (
          <li key={l.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-line py-2.5 font-mono text-[11px] last:border-b-0 max-sm:grid-cols-1">
            <span className="flex items-center gap-2.5 text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">
              <Dot tone={l.tone} pulse={l.tone === "pos"} />
              {l.label}
            </span>
            <span className={l.tone === "pos" ? "text-ink-2" : l.tone === "gold" ? "text-gold" : "text-ink-4"}>{l.text}</span>
          </li>
        ))}
      </ul>

      <Section id="switch" n={1} label="The switch" lead={<>On or <em>off</em>.</>}>
        <PassSwitch on={p.on} />
        <div className="mt-6 max-w-2xl">
          <ReadyPush initial={p.readyPush} />
        </div>
        <p className="mt-5 max-w-2xl font-mono text-[10.5px] leading-[1.8] text-ink-4">
          Separate from Autopilot&apos;s switch. Off stops new trades on your accounts; open ones keep their stop and target, are still guarded, and still get their time exit. The track record in the book carries on either way. If Autopilot is also live, keep its cards off the accounts you trade here: one position per account.
        </p>
      </Section>

      <Section id="mac" n={2} label="Your Mac" lead={<>Places the orders, then <em>guards</em> every target.</>}>
        {oldBot && (
          <p className="mb-5 max-w-3xl border border-gold/60 p-3 font-mono text-[11px] leading-[1.8] text-gold">
            Your Mac is running bot {version}. This page needs {NEEDS}.0 or later (SOR trades at their own prices, and the goal guard). Run the two lines below in Terminal to update:
            download, then install.
          </p>
        )}
        <Runner status={runner} origin={origin} lastSeen={runner.lastSeen ? when(runner.lastSeen) : null} />
        <div className="mt-6 max-w-3xl space-y-2 font-mono text-[10.5px] leading-[1.8] text-ink-3">
          <p>
            <b className="font-normal text-ink">To update a Mac that&apos;s already set up:</b> run line 1 (download) and line 3 (install) again. Your key and TopstepX details stay.
          </p>
          <p>
            <b className="font-normal text-ink">The goal guard.</b> Every account gets its own target price, held as that account&apos;s own order at Topstep. While a real trade is open the Mac looks every few seconds: if the target order has been moved it is put back, if the stop or target order is missing your phone is told, and if price trades through the target with the position still open that account is closed at market. A guard close can fill a little past the target, because it is a market order sent after the fact. Switch the guard off per card under Profit target.
          </p>
        </div>
      </Section>

      <Section id="tradingview" n={3} label="TradingView" lead={<>One script, <em>one</em> alert.</>}>
        <ol className="max-w-3xl list-decimal space-y-2 pl-5 font-mono text-[11px] leading-[1.8] text-ink-3">
          <li>
            Tap <b className="font-normal text-ink">Copy the script</b> below. In TradingView: Pine Editor → New → select everything and paste over it → Save → Add to chart, on <b className="font-normal text-ink">CME_MINI:MNQ1!</b>, <b className="font-normal text-ink">1 minute</b>. It shows as <b className="font-normal text-ink">{PASS_PINE_NAME}</b>.
          </li>
          <li>In the script&apos;s settings, put your Webhook Secret (the same as BOT_WEBHOOK_SECRET in Vercel) and leave <b className="font-normal text-ink">Send alerts</b> ticked.</li>
          <li>
            Create one alert: Condition = that script → <b className="font-normal text-ink">alert() function calls only</b> (not &quot;Order fills&quot;), Expiration = open-ended, Notifications → Webhook URL below, and tick Notify in app (so you hear if it ever stops). Leave the Message box as it is.
          </li>
          <li>
            <b className="font-normal text-ink">Delete the alerts on the older scripts</b> (the separate &quot;MNQ Pass C&quot; and SOR scripts). This one alert sends both kinds of trade; two alerts for the same trade would be turned away as repeats here, but there is no reason to keep them.
          </li>
          <li>
            <b className="font-normal text-ink">Heartbeat.</b> Ten minutes before each session the script also sends a small &quot;I&apos;m running&quot; message (the Sniper script: at 09:30 New York). If one doesn&apos;t arrive, your phone is told the alert may have stopped. A script pasted before 15 November has no heartbeat: copy it again to get it.
          </li>
          <li>The script only sends the trade. Size, stop, target and whether an account takes it are all decided here, per card. The &quot;qty 10&quot; in its message is ignored.</li>
        </ol>
        <div className="mt-5">
          <CopyScript code={PASS_PINE} />
        </div>
        <div className="mt-4 max-w-3xl">
          <Copy label="Webhook URL (the same for both scripts)" value={`${origin}/api/bot/webhook`} />
        </div>
        <div className="mt-10 max-w-3xl border-t border-line pt-6">
          <div className="mb-3 font-mono text-[9px] tracking-[0.24em] text-gold uppercase">Second script · Sniper (funded accounts)</div>
          <ol className="list-decimal space-y-2 pl-5 font-mono text-[11px] leading-[1.8] text-ink-3">
            <li>
              Only needed if a card trades Sniper. Copy it below and add it to a <b className="font-normal text-ink">second chart</b>: <b className="font-normal text-ink">CME_MINI:MNQ1!</b>, <b className="font-normal text-ink">5 minute</b> (not 1 minute). It shows as <b className="font-normal text-ink">{SNIPER_PINE_NAME}</b>, and its panel says &quot;5m OK&quot; when the chart is right.
            </li>
            <li>Same Webhook Secret in its settings, <b className="font-normal text-ink">Send alerts</b> ticked. It needs about 25 trading days of chart history before it can call a sniper day.</li>
            <li>
              Its own alert: Condition = that script → <b className="font-normal text-ink">alert() function calls only</b>, open-ended, the same Webhook URL. Keep &quot;Send Sniper signals&quot; switched off in any SOR script, so Sniper never arrives twice.
            </li>
          </ol>
          <div className="mt-5">
            <CopyScript code={SNIPER_PINE} />
          </div>
        </div>
      </Section>

      <Section id="accounts" n={4} label="Accounts" lead={<>Each account knows its <em>stage</em>.</>}>
        <PassAccounts accounts={p.accounts} options={runner.accounts ?? []} />
        <div className="mt-6 max-w-3xl">
          <div className="mb-2 font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase">Your TopstepX accounts · from your Mac{runner.accountsAt ? ` · ${when(runner.accountsAt)}` : ""}</div>
          {(runner.accounts ?? []).length === 0 ? (
            <p className="font-mono text-[11px] text-ink-3">Your Mac sends this list when it starts and around each session. Pick from it when you fill a card in.</p>
          ) : (
            <ul className="border-t border-line">
              {runner.accounts.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-x-4 border-b border-line py-2.5 font-mono text-[11px]">
                  <span className="text-ink">{o.name}</span>
                  <span className="text-ink-4">
                    ID {o.id}
                    {o.balance !== null && ` · $${o.balance.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`}
                    {!o.canTrade && " · can't trade"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-6 max-w-3xl font-mono text-[10.5px] leading-[1.8] text-ink-4">
          Pick the account type and the card takes its tested rules (eval: 10 MNQ, $1,640 a day, passes at $3,000, SOR on; funded: 7 MNQ, $1,000 a day, payout at $4,000, no SOR). The four boxes are yours to change: contracts, max daily loss (blank = none), max daily win and the account profit target. Every trade&apos;s target is what that account still needs to reach its max daily win, or its account target if that is nearer, so each account closes at its own price. When the account target is reached the card switches itself off and your phone gets a push. Dry run tracks every trade and places nothing; Real orders places them at Topstep from your Mac.
        </p>
      </Section>

      <Section id="news" n={5} label="News and hedging" lead={<>Out of the way of the <em>big</em> releases.</>}>
        <div className="max-w-3xl">
          <NewsMinutes initial={p.newsMinutes} action={setPassNewsMinutes} />
          <ul className="mt-6">
            {p.newsMinutes === 0 && <li className="font-mono text-[11px] text-gold">Blackout is off: the pass plan trades straight through news.</li>}
            {p.newsMinutes > 0 && blackouts.length === 0 && <li className="font-mono text-[11px] text-ink-3">No high-impact US releases in the next week.</li>}
            {p.newsMinutes > 0 &&
              blackouts.map((w) => (
                <li key={w.at} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-line py-2.5 font-mono text-[11px]">
                  <span className="text-ink">{w.titles.join(" · ")}</span>
                  <span className="text-ink-2">{nyTime(w.at)} NY</span>
                  <span className="col-span-2 text-[10px] text-ink-4">
                    No entries {local(w.from)}–{local(w.to)} your time
                  </span>
                </li>
              ))}
          </ul>
          <div className="mt-4 space-y-2 font-mono text-[10.5px] leading-[1.8] text-ink-4">
            <p>
              Its own setting, separate from Autopilot&apos;s (it started on the same number). Any number of minutes from 0 to 120; 0 switches it off. A C or SOR signal that arrives inside a window is skipped on every account and written in the book with the release that blocked it. A trade already open keeps its stop and target through the news; only new entries wait. High-impact US releases from the Forex Factory calendar{fresh ? `, last refreshed ${when(fresh.toISOString())}` : ""}. The 7-year backtest had no news rule, so a blackout will skip some trades the test took.
            </p>
            <p>
              <b className="font-normal text-ink-2">Hedge blocker, always on.</b> No account goes one way while another is open the other way. It is checked twice: here in the book (every open pass-plan and Autopilot trade), and again by your Mac at Topstep, across every account your login can see, including trades you placed by hand. If any account holds the other side, or can&apos;t be checked, the order is not placed and your phone is told.
            </p>
          </div>
        </div>
      </Section>

      <Section id="now" n={6} label="Right now" lead={<>Open trades and today&apos;s <em>SOR</em>.</>}>
        <div className="grid max-w-4xl gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-3 font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase">Open positions</div>
            <ul>
              {open.length === 0 && <li className="font-mono text-[11px] text-ink-4">Nothing open.</li>}
              {open.map((t) => (
                <li key={t.id} className="border-b border-line py-2 font-mono text-[11px]">
                  <span className="text-ink">
                    {t.account} · {t.strategy === "SNIPER" ? "Sniper" : `${t.strategy} ${SESSION_NAME[t.session]}`} · {t.dir} {t.qty}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-ink-3">
                    {t.status === "pending" ? "waiting for your Mac" : `in @ ${t.entry}`} · stop {t.stop} · target {t.target}
                    {t.mode !== "live" && ` (${t.stage === "track" ? "track record" : t.mode === "dry" ? "dry run" : "yours to place"})`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-3 font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase">
              SOR today · health <span className={p.sorHealth === "LIVE" ? "text-pos" : "text-gold"}>{p.sorHealth}</span>
            </div>
            <ul>
              {(Object.keys(SOR_SESSIONS) as (keyof typeof SOR_SESSIONS)[]).map((ses) => {
                const used = p.sorToday.find((x) => x.session === ses);
                return (
                  <li key={ses} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 border-b border-line py-2 font-mono text-[11px]">
                    <span className="text-ink-2">{SESSION_NAME[ses]}</span>
                    <span className={used ? (used.safe && !used.note ? "text-pos" : "text-ink-3") : "text-ink-4"}>
                      {used ? (used.note ?? `first signal safe, handed to the accounts (${when(used.at)})`) : `waiting for the first signal (first ${SOR_SESSIONS[ses].window} minutes)`}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 mb-3 font-mono text-[9px] tracking-[0.24em] text-ink-4 uppercase">Sniper today</div>
            <p className="border-y border-line py-2 font-mono text-[11px]">
              {p.sniperToday ? (
                <span className="text-gold">Sniper day: {p.sniperToday} only. A trade follows only if the 09:30–10:00 range breaks that way between 10:00 and 15:00 New York.</span>
              ) : (
                <span className="text-ink-4">No sniper day called today (the script decides at 09:30 New York; most days are not).</span>
              )}
            </p>
            <p className="mt-3 font-mono text-[10px] leading-[1.7] text-ink-4">
              {sniperCards.length ? `${sniperCards.length} ${sniperCards.length === 1 ? "card takes" : "cards take"} Sniper: ${sniperCards.map((a) => a.label).join(", ")}. ` : "No card that's switched on takes Sniper. "}
              {sorCards.length ? `${sorCards.length} ${sorCards.length === 1 ? "card takes" : "cards take"} SOR: ${sorCards.map((a) => a.label).join(", ")}.` : "No card that's switched on takes SOR."} One chance per session: the first valid signal decides, for every account. SOR: never Thursday, never NY PM or Asia.
            </p>
          </div>
        </div>
      </Section>

      <Section id="book" n={7} label="The book" lead={<>Every signal, every <em>account</em>.</>}>
        <div className="mb-6 grid max-w-4xl gap-6 font-mono text-[11px] text-ink-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="mb-2 text-[9px] tracking-[0.24em] text-gold uppercase">Track record · every signal, always</div>
            <div>All · {tally(tracked)}</div>
            <div className="text-ink-4">C (10 MNQ) · {tally(tracked.filter((t) => t.strategy === "C"))}</div>
            <div className="text-ink-4">SOR (5 MNQ) · {tally(tracked.filter((t) => t.strategy === "SOR"))}</div>
            <div className="text-ink-4">Sniper ($700 risk) · {tally(tracked.filter((t) => t.strategy === "SNIPER"))}</div>
          </div>
          <div className="space-y-1">
            <div className="mb-2 text-[9px] tracking-[0.24em] text-ink-4 uppercase">Your accounts</div>
            <div>All · {tally(mine)}</div>
            <div className="text-ink-4">C · {tally(mine.filter((t) => t.strategy === "C"))}</div>
            <div className="text-ink-4">SOR · {tally(mine.filter((t) => t.strategy === "SOR"))}</div>
            <div className="text-ink-4">Sniper · {tally(mine.filter((t) => t.strategy === "SNIPER"))}</div>
          </div>
        </div>
        <p className="mb-5 max-w-3xl font-mono text-[10.5px] leading-[1.8] text-ink-4">
          The track record follows every C, safe SOR and Sniper signal the scripts send, on paper, at the tested size (C: 50-point stop, 82.5-point target; SOR and Sniper: their own prices), with no account rules, no day cap and no news rule. It runs whether the switch is on or off and whatever your cards are doing, for as long as the TradingView alert is active and your Mac is on to follow each trade to its close. It never places an order.
        </p>
        <ul>
          {p.trades.length === 0 && <li className="font-mono text-[11px] text-ink-4">Nothing yet. The first decision comes at the next signal.</li>}
          {p.trades.map((t) => (
            <li key={t.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-line py-2 font-mono text-[11px]", t.status === "skipped" && "opacity-55")}>
              <span className="truncate text-ink-2">
                {when(t.enteredAt)} · <span className={t.strategy !== "C" ? "text-gold" : undefined}>{t.strategy === "SNIPER" ? "Sniper" : t.strategy}</span>
                {t.strategy !== "SNIPER" && ` ${SESSION_NAME[t.session]}`} · <span className={t.stage === "track" ? "text-gold" : undefined}>{t.account}</span>
                {t.stage !== "track" && ` · ${t.stage}`}
                {t.mode !== "live" && t.stage !== "track" && <span className="text-ink-4"> ({t.mode === "dry" ? "dry run" : "yours"})</span>}
              </span>
              <span className={cn("num text-right", (t.pnl ?? 0) > 0 ? "text-pos" : (t.pnl ?? 0) < 0 ? "text-neg" : "text-ink-4")}>
                {t.status === "closed" ? money(t.pnl ?? 0) : t.status === "open" ? "open" : t.status === "pending" ? "placing" : t.status}
              </span>
              <span className="col-span-2 truncate text-[10px] text-ink-4" title={t.reason ?? undefined}>
                {t.status === "skipped" || t.status === "error"
                  ? t.reason
                  : `${t.dir} ${t.qty} @ ${t.entry} · SL ${t.stop} · TP ${t.target}${t.exitReason ? ` · ${t.exitReason === "time" ? "time exit" : t.exitReason === "goal" ? "closed by the goal guard" : t.exitReason}` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="rules" n={8} label="The rules" lead={<>What the bot <em>does</em>.</>}>
        <div className="max-w-3xl space-y-3 font-mono text-[11px] leading-[1.8] text-ink-3">
          <p>
            <b className="font-normal text-ink">Script C</b> (every account). Asia: the 20:00 New York bar closes → LONG, out by 02:59 (not Friday or Saturday evening). London: the 03:30 bar closes above the 03:01 open → SHORT, otherwise LONG, out by 09:39. New York: the 10:10 bar closes at or above the 09:41 open → LONG, otherwise SHORT, out by 16:09. The script only sends a trade when the last finished 4H candle points the same way and price is outside the 70% value area, so nothing is re-checked here.
          </p>
          <p>
            <b className="font-normal text-ink">For each account, on each C alert:</b> skip if a trade is open, today&apos;s goal is reached, or the account is passed, payout-ready or blown. Stop: always the card&apos;s stop (50 points). Size: the card&apos;s contracts, or fewer at the same stop when the room above the loss limit is short. Target: what&apos;s left of today&apos;s goal plus $1 a contract for costs, divided by contracts × $2, rounded up to the tick (or your fixed target, if you set one).
          </p>
          <p>
            <b className="font-normal text-ink">Today&apos;s goal.</b> Topstep eval: the smaller of $1,640 and what the account still needs to pass inside the 55% rule (so $1,640, then about $1,370). Topstep funded: $1,000, and once 5 winning days are banked, only what&apos;s left to the payout balance. Lucid step 1: $1,200 inside the 40% rule. Lucid pre-live: up to $2,000.
          </p>
          <p>
            <b className="font-normal text-ink">SOR Safe</b> (Topstep evals, unless you switch it on elsewhere). Only swing 3/3, only the first valid signal of London (first 150 minutes) and NY AM (first 90), never Thursday, and only if that signal is safe. 5 MNQ at SOR&apos;s own stop and target prices; the target is capped at what&apos;s left of today&apos;s goal; fewer contracts if room is short, never a moved stop; flat by 16:09. If it can&apos;t be taken, the session&apos;s chance is still used. A C trade always comes first.
          </p>
          <p>
            <b className="font-normal text-ink">Sniper</b> (Topstep funded, unless you switch it on elsewhere). A rare trend-day breakout from its own 5-minute script, about 18 trades a year. At 09:30 New York the script calls a sniper day and its direction; a trade follows only if the 09:30–10:00 range then breaks that way between 10:00 and 15:00. Contracts = the card&apos;s Sniper risk ($700) ÷ (the stop in points × $2), at least 1, usually 2 MNQ. Stop and target are the script&apos;s own prices; the target is capped at what&apos;s left of the day&apos;s max win; fewer contracts if room is short, none means skip; never on top of an open trade; flat by 15:55. Its result counts toward the day, winning days and the loss limit like any C trade.
          </p>
          <p>
            <b className="font-normal text-ink">Payouts.</b> Funded reaches its payout balance with 5 winning days: the card pauses and tells you. After you press Payout taken: profit minus the payout, loss limit fixed at $0, winning days from 0, same account, same rules.
          </p>
          <p className="text-ink-4">Backtested Nov 2019 – Nov 2026 (eval pass rate 52.1% with SOR, 50.4% without); expect live results a few points lower. Run it on Practice first and compare each trade with the chart.</p>
        </div>
      </Section>

      <Section id="log" n={9} label="Log">
        <ul>
          {p.events.length === 0 && <li className="font-mono text-[11.5px] text-ink-3">Quiet so far.</li>}
          {p.events.map((e, i) => (
            <li key={i} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 border-b border-line py-2 font-mono text-[10.5px] max-sm:grid-cols-1">
              <span className="text-ink-4">{when(e.at)}</span>
              <span className={cn("whitespace-pre-line", e.level === "error" ? "text-neg" : e.level === "warn" ? "text-gold" : "text-ink-3")}>{e.message}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
