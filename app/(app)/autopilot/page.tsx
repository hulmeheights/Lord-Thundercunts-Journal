import { headers } from "next/headers";
import { getSettings } from "@/lib/data/settings";
import { autopilotState, type BotTradeView } from "@/lib/data/bot";
import { botSetup } from "@/lib/bot/config";
import { ALERT_MESSAGE, SESSION_LABEL, type Session } from "@/lib/bot/signal";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";
import { Meta, PageHead, Section } from "@/components/m";
import { SectionIndex } from "@/components/m/SectionIndex";
import { ModeSwitch } from "@/components/autopilot/ModeSwitch";
import { Accounts } from "@/components/autopilot/Accounts";
import { Copy } from "@/components/autopilot/Copy";
import { AlertExpiry } from "@/components/autopilot/AlertExpiry";
import { Runner } from "@/components/autopilot/Runner";
import { runnerStatus } from "@/lib/bot/runner";
import { NewsMinutes } from "@/components/autopilot/NewsMinutes";
import { newsAround, newsFreshness, refreshNews } from "@/lib/bot/newsFeed";
import { windows } from "@/lib/bot/news";
import { todayKey } from "@/lib/analytics/time";
import { Seg } from "@/components/m/Seg";
import { historyStats, tally, type Tally } from "@/lib/bot/history";
import { liveRecord, sinceBacktest, trackRecord } from "@/lib/data/history";
import { BACKTEST_SOURCE, backtestTrades, combineSim, payoutSim, setsRun, setsYear, worse, type BtTrade } from "@/lib/bot/backtest";
import { tradingDay } from "@/lib/bot/drycheck";
import type { HistTrade } from "@/lib/bot/history";
import { TrackImport } from "@/components/autopilot/TrackImport";
import { listLedger } from "@/lib/data/ledger";
import { FIRM_SUGGESTIONS, summarizeLedger } from "@/lib/analytics/ledger";
import { LedgerSection } from "@/components/guardian/Ledger";
import { WinRateChart } from "@/components/autopilot/WinRateChart";
import { DryCheck } from "@/components/autopilot/DryCheck";

export const metadata = { title: "Autopilot" };

/** A glowing green light, so live is unmistakable. */
function LiveLight({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[0.45em]">
      <span aria-hidden className="relative inline-block h-[0.42em] w-[0.42em]">
        <span className="absolute inset-0 animate-ping rounded-full bg-pos opacity-60" />
        <span className="absolute inset-0 rounded-full bg-pos shadow-[0_0_10px_3px_rgba(116,184,156,0.75)]" />
      </span>
      {children}
    </span>
  );
}

const SESSIONS: Session[] = ["NYAM", "NYPM", "LON", "ASIA"];

function book(trades: BotTradeView[]) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== null);
  const won = closed.filter((t) => t.pnl! > 0);
  const gw = won.reduce((s, t) => s + t.pnl!, 0);
  const gl = -closed.filter((t) => t.pnl! < 0).reduce((s, t) => s + t.pnl!, 0);
  return { n: closed.length, winRate: closed.length ? won.length / closed.length : null, net: gw - gl, pf: gl > 0 ? gw / gl : closed.length ? Infinity : null };
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const pfText = (x: number | null) => (x === null ? "—" : Number.isFinite(x) ? x.toFixed(2) : "∞");

/** One breakdown: name · trades · win rate (with a bar) · PF · net. */
/** 7m · 1h 05m */
const holdText = (m: number | null) => {
  if (m === null) return "—";
  const r = Math.round(m);
  return r < 60 ? `${r}m` : `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, "0")}m`;
};

function Breakdown({ title, rows }: { title: string; rows: (Tally & { key: string; label?: string })[] }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">{title}</div>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className={cn("grid grid-cols-[5.5rem_3.2rem_minmax(0,1fr)_3.2rem_5.5rem] items-center gap-x-3 border-b border-line py-1.5 font-mono text-[11px]", !r.n && "opacity-45")}>
            <span className="truncate text-ink-2">{r.label ?? r.key}</span>
            <span className="text-ink-4">{r.n}</span>
            <span className="flex items-center gap-2">
              <span className="relative h-[2px] flex-1 bg-line">
                <i className={cn("absolute top-0 left-0 block h-[2px]", (r.winRate ?? 0) >= 0.5 ? "bg-pos" : "bg-gold")} style={{ width: `${(r.winRate ?? 0) * 100}%` }} />
              </span>
              <span className="w-9 text-right text-ink">{pct(r.winRate)}</span>
            </span>
            <span className="text-right text-ink-4">{pfText(r.pf)}</span>
            <span className={cn("num text-right", r.net > 0 ? "text-pos" : r.net < 0 ? "text-neg" : "text-ink-4")}>{r.n ? fmtMoney(r.net, { sign: true }) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Backtest trades plus the bot's own since, for both account types, ready for the sets-of-5 run. */
async function setsOfFive(by: number) {
  const out = {} as Record<"eval" | "funded", BtTrade[]>;
  for (const mode of ["eval", "funded"] as const) {
    const bt = backtestTrades(mode);
    const since = await sinceBacktest(mode, bt.at(-1)!.day);
    const extra: BtTrade[] = since.map((t) => ({ ...t, mode, day: tradingDay(t.entryAt), quiet: false, capped: false, reason: "other" }));
    out[mode] = worse([...bt, ...extra], by);
  }
  return { run: setsRun(out.eval, out.funded), year: setsYear(out.eval, out.funded) };
}

export default async function AutopilotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // The 2-year backtest is what most people want to see first; the other tabs are a click away.
  const track: "tv" | "live" | "bt" = sp.track === "live" ? "live" : sp.track === "tv" ? "tv" : "bt";
  const btMode: "eval" | "funded" = sp.bt === "funded" ? "funded" : "eval";
  const btTrades = track === "bt" ? backtestTrades(btMode) : [];
  const btLast = btTrades.at(-1)?.day ?? "2026-11-04";
  const [settings, s, h, ledger, record] = await Promise.all([
    getSettings(),
    autopilotState(),
    headers(),
    listLedger("autopilot"),
    track === "tv"
      ? trackRecord("tv").then((r) => ({ ...r, perAccount: [] as HistTrade[] }))
      : track === "live"
        ? liveRecord().then((r) => ({ ...r, imports: [] }))
        : sinceBacktest(btMode, btLast).then((since) => ({ trades: [...btTrades, ...since], perAccount: [] as HistTrade[], imports: [] })),
  ]);
  const sim = track === "bt" ? (btMode === "eval" ? combineSim(btTrades) : payoutSim(btTrades)) : null;
  // Sets of 5 on Topstep, along the real two years plus the bot's own trades since; "realistic" = every trade $50 worse.
  const btCase = sp.bc === "50" ? 50 : 0;
  const sets = track === "bt" ? await setsOfFive(btCase) : null;
  const setup = botSetup();
  const runner = await runnerStatus();
  await refreshNews();
  const [upcoming, fresh] = await Promise.all([newsAround(new Date(Date.now() - 60 * 60_000), new Date(Date.now() + 8 * 86_400_000)), newsFreshness()]);
  const blackouts = windows(upcoming, s.newsMinutes);
  const ny = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "America/New_York", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const local = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const daysLeft = s.alertExpires ? Math.round((Date.parse(`${s.alertExpires}T00:00:00Z`) - Date.parse(`${todayKey(settings.profile.timezone)}T00:00:00Z`)) / 86_400_000) : null;
  const tz = settings.profile.timezone;
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-journal.vercel.app";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const on = s.accounts.filter((a) => a.enabled).length;
  const live = s.mode === "live";
  const shown = s.trades.filter((t) => t.mode === (live ? "live" : "paper") || t.status !== "skipped").slice(0, 60);
  const books = { live: s.trades.filter((t) => t.mode === "live"), paper: s.trades.filter((t) => t.mode === "paper" || t.mode === "dry") };
  const steps = [
    { ok: setup.secret, text: "Webhook secret set in Vercel (BOT_WEBHOOK_SECRET, at least 16 characters)" },
    { ok: setup.telegram, text: "Telegram receipts (optional: TELEGRAM_TOKEN + TELEGRAM_CHAT_ID)" },
    { ok: runner.paired, text: "Your Mac set up to place the orders (section 02)" },
    { ok: s.accounts.some((a) => a.enabled && a.topstepAccount), text: "At least one card switched on and pointed at a TopstepX account" },
    { ok: !!s.lastSignal, text: "First alert received from TradingView" },
    { ok: !!s.alertExpires && (daysLeft ?? -1) >= 0, text: "Alert expiry date added (for the reminder)" },
  ];

  return (
    <>
      <SectionIndex ids={["switch", "mac", "accounts", "news", "ledger", "drycheck", "record", "evals", "setup", "log"]} />
      <PageHead
        eyebrow="07 — Autopilot"
        title={
          <>
            The reversal, on <em>autopilot</em>.
          </>
        }
        sub="Your MNQ Session Open Reversal strategy fires on TradingView. The bot on your Mac applies your rules and places the bracketed orders from your own computer; this page holds your settings and keeps the book."
        meta={<Meta value={live ? <LiveLight>Live</LiveLight> : s.mode === "off" ? "Off" : "Paper"} tone={live ? "pos" : null} caption={`${on} ${on === 1 ? "account" : "accounts"} on${s.lastSignal ? ` · last alert ${when(s.lastSignal.at)}` : " · no alerts yet"}`} />}
      />

      {daysLeft !== null && daysLeft <= 7 && (
        <a href="#setup" className="mb-4 block border border-gold/50 px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-gold">
          {daysLeft < 0 ? "Your TradingView alert has expired: Autopilot gets no signals until you renew it." : daysLeft === 0 ? "Your TradingView alert expires today. Renew it in TradingView, then update the date in Setup." : `Your TradingView alert expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. Renew it in TradingView, then update the date in Setup.`}
        </a>
      )}

      <Section id="switch" n={1} label="The switch" lead={<>Off, on paper, or <em>live</em>.</>}>
        <div className="max-w-2xl">
          <ModeSwitch mode={s.mode} ready={setup.secret && runner.paired} />
          <p className="mt-6 font-mono text-[10.5px] leading-[1.8] text-ink-4">
            Switching off only stops new entries. A trade already open keeps its stop and target at Topstep. Start on Paper: it follows every signal with no orders, so you can see the bot behave before money is involved.
          </p>
        </div>
      </Section>

      <Section id="mac" n={2} label="Your Mac" lead={<>Orders leave from <em>your</em> computer.</>}>
        <Runner status={runner} origin={origin} lastSeen={runner.lastSeen ? when(runner.lastSeen) : null} />
      </Section>

      <Section id="accounts" n={3} label="Accounts" lead={<>Mirrored to <em>{on}</em>.</>}>
        <Accounts accounts={s.accounts} live={live} macAccounts={runner.accounts} macAccountsAt={runner.accountsAt ? when(runner.accountsAt) : null} />
        <p className="mt-6 max-w-3xl font-mono text-[10.5px] leading-[1.8] text-ink-4">
          For every signal, each card runs the 12 checks in order and stops at the first that fails (logged as &quot;step N&quot; in the book): signal set, session, weekday, entry window, quiet rule, target, flat, one trade a session, trades a day and the day&apos;s limits (counted from 18:00 New York), losing days this week, and the daily cap on the target. The bot&apos;s own safety checks come after (step 13): news blackout if switched on, profit target, the right Topstep account, and no hedging across accounts. Orders use the script&apos;s stop and the target exactly as decided.
        </p>
      </Section>

      <Section id="news" n={4} label="News" lead={<>Out of the way of the <em>big</em> releases.</>}>
        <div className="max-w-3xl">
          <NewsMinutes initial={s.newsMinutes} />
          <ul className="mt-6">
            {s.newsMinutes === 0 && <li className="font-mono text-[11px] text-gold">Blackout is off: Autopilot trades straight through news.</li>}
            {s.newsMinutes > 0 && blackouts.length === 0 && <li className="font-mono text-[11px] text-ink-3">No high-impact US releases in the next week.</li>}
            {s.newsMinutes > 0 &&
              blackouts.map((w) => (
                <li key={w.at} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-line py-2.5 font-mono text-[11px]">
                  <span className="text-ink">{w.titles.join(" · ")}</span>
                  <span className="text-ink-2">{ny(w.at)} NY</span>
                  <span className="col-span-2 text-[10px] text-ink-4">
                    No entries {local(w.from)}–{local(w.to)} your time
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-4 font-mono text-[10.5px] leading-[1.8] text-ink-4">
            High-impact US releases from the Forex Factory calendar (CPI, NFP, FOMC, PPI, GDP and the like), refreshed every few hours{fresh ? `, last at ${when(fresh.toISOString())}` : ""}. A trade already open keeps its stop and target through the news; only new entries wait.
          </p>
        </div>
      </Section>

      <Section id="ledger" n={5} label="The book" lead={<>Every signal, every <em>account</em>.</>}>
        <div className="grid gap-8 lg:grid-cols-2">
          {(["live", "paper"] as const).map((k) => {
            const b = book(books[k]);
            return (
              <div key={k} className="border-t border-line-2 pt-4">
                <div className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">{k === "live" ? "Live" : "Dry run / paper"}</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-[12px]">
                  <span className={cn("num text-[20px]", b.net > 0 ? "text-pos" : b.net < 0 ? "text-neg" : "text-ink")}>{fmtMoney(b.net, { sign: true })}</span>
                  <span className="text-ink-3">
                    {b.n} closed{b.winRate !== null && ` · ${Math.round(b.winRate * 100)}% won`}
                    {b.pf !== null && ` · PF ${Number.isFinite(b.pf) ? b.pf.toFixed(2) : "∞"}`}
                  </span>
                </div>
                <ul className="mt-3">
                  {SESSIONS.map((ss) => {
                    const sb = book(books[k].filter((t) => t.session === ss));
                    return (
                      <li key={ss} className={cn("grid grid-cols-[5.5rem_1fr_auto] gap-x-3 border-b border-line py-1.5 font-mono text-[11px]", !sb.n && "opacity-45")}>
                        <span className="text-ink-2">{SESSION_LABEL[ss]}</span>
                        <span className="text-ink-4">
                          {sb.n} trades{sb.winRate !== null && ` · ${Math.round(sb.winRate * 100)}%`}
                        </span>
                        <span className={cn("num", sb.net > 0 ? "text-pos" : sb.net < 0 ? "text-neg" : "text-ink-4")}>{sb.n ? fmtMoney(sb.net, { sign: true }) : "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <ul className="mt-10">
          {shown.length === 0 && <li className="font-mono text-[11.5px] text-ink-3">No signals yet. They appear here the moment TradingView sends one.</li>}
          {shown.map((t) => (
            <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-line py-3 font-mono text-[11px]">
              <span className="text-ink">
                <span className={t.dir === "LONG" ? "text-pos" : "text-neg"}>{t.dir}</span> {SESSION_LABEL[t.session]} · {t.qty} MNQ · {t.accountLabel}
                {t.mode !== "live" && <span className="ml-2 text-[9px] tracking-[0.2em] text-gold uppercase">{t.mode === "dry" ? "dry run" : "paper"}</span>}
              </span>
              <span className={cn("num text-right", t.pnl === null ? "text-ink-4" : t.pnl > 0 ? "text-pos" : t.pnl < 0 ? "text-neg" : "text-ink-3")}>
                {t.status === "closed" && t.pnl !== null ? fmtMoney(t.pnl, { sign: true }) : t.status === "open" ? "open" : t.status === "error" ? "failed" : "skipped"}
              </span>
              <span className="col-span-2 text-[10px] text-ink-4">
                {when(t.enteredAt)} · in {t.entry} · SL {t.stop} · TP {t.target}
                {t.exit !== null && ` · out ${t.exit}`}
                {t.reason && (
                  <span className={t.status === "error" ? "text-neg" : ""}>
                    {" "}
                    · {t.step != null ? `step ${t.step}: ` : ""}
                    {t.reason}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="drycheck" n={6} label="Dry-run check" lead={<>Decisions against the <em>expected</em> trades.</>}>
        <DryCheck />
      </Section>

      <Section id="record" n={7} label="Track record" lead={<>Every trade, <em>kept</em>.</>}>
        <Seg
          className="mb-6"
          value={track}
          options={[
            { value: "bt", label: "Backtest · 2 years", href: "/autopilot?track=bt#record" },
            { value: "live", label: "Live · your accounts", href: "/autopilot?track=live#record" },
            { value: "tv", label: "TradingView imports", href: "/autopilot?track=tv#record" },
          ]}
        />
        {track === "bt" ? (
          <div>
            <Seg
              className="mb-4"
              value={btMode}
              options={[
                { value: "eval", label: "Eval · 3/3", href: "/autopilot?track=bt&bt=eval#record" },
                { value: "funded", label: "Funded · 3/2", href: "/autopilot?track=bt&bt=funded#record" },
              ]}
            />
            <p className="max-w-2xl font-mono text-[11px] leading-[1.8] text-ink-4">
              Every trade the strategy would have taken from {btTrades[0]?.day} to {btLast} ({BACKTEST_SOURCE}), 5 MNQ, after commission. The bot&apos;s own {btMode} trades (dry run or live) are added after it as they close, so the record keeps growing.
            </p>
            {sets && (
              <div className="mt-6 border border-gold/40 p-4 font-mono text-[11px]">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-[9.5px] tracking-[0.3em] text-gold uppercase">Sets of 5 · Topstep 50K · new set only when the whole set fails or busts</span>
                  <Seg
                    value={btCase === 50 ? "50" : "0"}
                    options={[
                      { value: "0", label: "As tested", href: `/autopilot?track=bt&bt=${btMode}#record` },
                      { value: "50", label: "Realistic (−$50 a trade)", href: `/autopilot?track=bt&bt=${btMode}&bc=50#record` },
                    ]}
                  />
                </div>
                <div className="mt-4 text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">Any 12 months ({sets.year.starts} start days)</div>
                <div className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                  <span className="text-ink-2">
                    Net after eval fees: <span className="num text-[16px] text-pos">{fmtMoney(sets.year.net.avg)}</span> average · typical {fmtMoney(sets.year.net.typical)}
                  </span>
                  <span className="text-ink-3">
                    1 year in 10 below {fmtMoney(sets.year.net.low10)} · worst {fmtMoney(sets.year.net.worst)} · best {fmtMoney(sets.year.net.best)}
                  </span>
                  <span className="text-ink-3">
                    Payout days ($9,000 each): {sets.year.payoutDays.avg.toFixed(1)} average ({sets.year.payoutDays.fewest}–{sets.year.payoutDays.most})
                  </span>
                  <span className="text-ink-3">
                    Eval fees: {fmtMoney(sets.year.fees.avg)} average · worst {fmtMoney(sets.year.fees.worst)} · {sets.year.sets.toFixed(1)} sets bought
                  </span>
                </div>
                <div className="mt-6 text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">
                  Started {sets.run.events[0]?.day} and run to today · {sets.run.sets} sets · {sets.run.payoutDays} payout days · fees {fmtMoney(sets.run.fees)} · paid {fmtMoney(sets.run.paid)} ·{" "}
                  <span className={sets.run.net >= 0 ? "text-pos" : "text-neg"}>net {fmtMoney(sets.run.net, { sign: true })}</span> · lowest point {fmtMoney(sets.run.lowest, { sign: true })}
                </div>
                <div className="mt-3 grid gap-x-10 gap-y-6 lg:grid-cols-2">
                  <ul>
                    {sets.run.months.map((m) => (
                      <li key={m.month} className="grid grid-cols-[4.5rem_1fr_1fr_1fr] gap-x-3 border-b border-line py-1 text-[10.5px]">
                        <span className="text-ink-2">{new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>
                        <span className="text-right text-ink-4">{m.fees ? `−${fmtMoney(m.fees)}` : ""}</span>
                        <span className="text-right text-pos">{m.paid ? `+${fmtMoney(m.paid)}` : ""}</span>
                        <span className={cn("num text-right", m.total >= 0 ? "text-ink" : "text-neg")}>{fmtMoney(m.total, { sign: true })}</span>
                      </li>
                    ))}
                    <li className="grid grid-cols-[4.5rem_1fr_1fr_1fr] gap-x-3 pt-1 text-[9px] tracking-[0.2em] text-ink-4 uppercase">
                      <span>month</span>
                      <span className="text-right">eval fees</span>
                      <span className="text-right">payouts</span>
                      <span className="text-right">running total</span>
                    </li>
                  </ul>
                  <ul>
                    {sets.run.events.map((ev, i) => (
                      <li key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-1 text-[10.5px]">
                        <span className="text-ink-4">{new Date(`${ev.day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}</span>
                        <span className={ev.kind === "payout" ? "text-pos" : ev.kind === "failed" || ev.kind === "busted" ? "text-neg" : ev.kind === "live" ? "text-gold" : "text-ink-2"}>{ev.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-3 text-[10px] leading-[1.7] text-ink-4">
                  5 copied Combines pass, bust and pay out together. Evals $120 a month each until passed; payouts $2,000 per account ($1,800 to you) every 5 winning days of $150+ at $4,000 profit, until the set busts; after the 4th payout Topstep is assumed to call you up to Live and close the Express accounts (the bot can&apos;t trade Live), so a new set is bought. Not included: activation, data and API fees, tax. The settings were tuned on these two years.
                </p>
              </div>
            )}
            {sim && (
              <div className="mt-6 border border-line-2 p-4 font-mono text-[11px]">
                <div className="text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">{btMode === "eval" ? "Topstep 50K Combine, started on every trading day" : "Funded 50K, first $2,000 payout, started on every trading day"}</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-1">
                  <span className="num text-[26px] text-ink">{pct(sim.rate)}</span>
                  <span className="text-ink-3">
                    {btMode === "eval" ? "passed" : "reached the payout"} ({sim.passed} of {sim.passed + sim.failed}) · {sim.failed} {btMode === "eval" ? "failed" : "busted first"}
                  </span>
                  {sim.medianDays !== null && (
                    <span className="text-ink-3">
                      typically {sim.medianDays} trading days ({sim.fastDays} quick · {sim.slowDays} slow)
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-[1.7] text-ink-4">
                  {btMode === "eval"
                    ? "Pass: +$3,000 with the best day at most 50% of the profit. Fail: the balance touches the trailing max loss ($2,000 under the highest end-of-day balance, locking at $50,000)."
                    : "Payout: 5 winning days of $150+ and $4,000 profit, before the balance touches the trailing max loss ($2,000)."}{" "}
                  Checked as each trade closes, so dips inside a trade aren&apos;t seen; {sim.unfinished} starts ran out of data. Settings were tuned on these two years, so expect live to be somewhat worse.
                </p>
              </div>
            )}
          </div>
        ) : track === "tv" ? (
          <TrackImport tz={tz} imports={record.imports} />
        ) : (
          <p className="max-w-2xl font-mono text-[11px] leading-[1.8] text-ink-4">Filled in by itself: every trade the bot takes on your Topstep accounts, from the moment it closes. One signal counts as one trade (P&amp;L added across accounts); each account is broken down below.</p>
        )}
        {record.trades.length === 0 ? (
          <p className="mt-8 font-mono text-[11.5px] text-ink-3">{track === "tv" ? "No strategy trades yet. Import your first TradingView export above." : "No live trades closed yet. They appear here by themselves."}</p>
        ) : (
          (() => {
            const st = historyStats(record.trades, tz);
            const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }) : "");
            return (
              <div className="mt-10">
                <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-[12px]">
                  <span className="num text-[28px] text-ink">{pct(st.all.winRate)}</span>
                  <span className={cn("num text-[20px]", st.all.net > 0 ? "text-pos" : st.all.net < 0 ? "text-neg" : "text-ink")}>{fmtMoney(st.all.net, { sign: true })}</span>
                  <span className="text-ink-3">
                    {st.all.n} trades · {st.all.won} won · PF {pfText(st.all.pf)}
                    {st.all.avgWin !== null && ` · avg win ${fmtMoney(st.all.avgWin)}`}
                    {st.all.avgLoss !== null && ` · avg loss ${fmtMoney(st.all.avgLoss)}`}
                  </span>
                  <span className="text-ink-4">
                    {d(st.first)} – {d(st.last)}
                  </span>
                </div>
                {st.hold.n > 0 && (
                  <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[11px] sm:grid-cols-5">
                    {[
                      ["Avg time in trade", st.hold.avg],
                      ["Median", st.hold.median],
                      ["Avg winner", st.hold.avgWin],
                      ["Avg loser", st.hold.avgLoss],
                      ["Longest", st.hold.longest],
                    ].map(([k, v]) => (
                      <div key={k as string}>
                        <div className="text-[9.5px] tracking-[0.2em] text-ink-4 uppercase">{k}</div>
                        <div className="mt-1 text-ink">{holdText(v as number | null)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {st.all.n >= 2 && (
                  <div className="mt-8">
                    <div className="mb-2 font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">
                      Win rate over time · <span className="text-pos">all trades</span> · <span className="text-gold">last 20</span>
                    </div>
                    <WinRateChart {...st.over} />
                  </div>
                )}
                <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
                  <Breakdown title="By session (New York time)" rows={st.sessions.map((r) => ({ ...r, label: SESSION_LABEL[r.key] }))} />
                  <Breakdown title="By hour (your time)" rows={st.hours} />
                  <Breakdown title="By day (your time)" rows={st.weekdays} />
                  <Breakdown title="By time in trade" rows={st.holds} />
                  <Breakdown title="Long or short" rows={st.dirs.map((r) => ({ ...r, label: r.key === "LONG" ? "Long" : "Short" }))} />
                  <Breakdown title="By month (one account, 5 MNQ)" rows={st.months.map((r) => ({ ...r, label: new Date(`${r.key}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) }))} />
                  <Breakdown title="By week (starting Monday)" rows={st.weeks.slice(0, 12).map((r) => ({ ...r, label: new Date(`${r.key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }))} />
                  {track === "bt" && st.accounts.length > 1 && <Breakdown title="Backtest vs since" rows={st.accounts} />}
                  {track === "live" && record.perAccount.length > 0 && <Breakdown title="By account" rows={[...new Set(record.perAccount.map((t) => t.account ?? "—"))].map((a) => ({ key: a, ...tally(record.perAccount.filter((t) => (t.account ?? "—") === a)) }))} />}
                </div>
                <p className="mt-6 font-mono text-[10px] text-ink-4">Columns: trades · win rate · profit factor · net P&amp;L{track === "live" ? " (from your real fill to the exit, before Topstep fees)" : track === "bt" ? " (after commission, as tested)" : " (after the strategy's commission)"}.</p>
              </div>
            );
          })()
        )}
      </Section>

      <LedgerSection id="evals" book="autopilot" label="Evals & payouts" n={8} entries={ledger} summary={summarizeLedger(ledger)} today={todayKey(tz)} firms={[...new Set(["Topstep", ...ledger.map((e) => e.firm), ...FIRM_SUGGESTIONS])]} />

      <Section id="setup" n={9} label="Setup" lead={<>Five minutes, <em>once</em>.</>}>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <ul className="space-y-2.5">
              {steps.map((st) => (
                <li key={st.text} className="flex gap-3 font-mono text-[11.5px] leading-[1.7]">
                  <span className={st.ok ? "text-pos" : "text-ink-4"}>{st.ok ? "✓" : "○"}</span>
                  <span className={st.ok ? "text-ink-2" : "text-ink-3"}>{st.text}</span>
                </li>
              ))}
            </ul>
            <ol className="mt-8 list-decimal space-y-2 pl-5 font-mono text-[11px] leading-[1.8] text-ink-3 marker:text-ink-4">
              <li>In Vercel, add BOT_WEBHOOK_SECRET, then redeploy. Your TopstepX login lives only on your Mac: the website has no Topstep connection, so don&apos;t add TopstepX keys to Vercel.</li>
              <li>On an MNQ1! 1-minute chart, add &quot;MNQ Session Open Reversal - Signals [1m]&quot; and paste the same secret into its Webhook Secret setting. Leave everything else on the defaults.</li>
              <li>Create one alert: Condition = the script → &quot;Any alert() function call&quot;, open-ended, webhook URL here. Leave the message box as it is: the script writes the message itself.</li>
              <li>Delete every older alert and remove the old strategy scripts from the chart, so nothing else sends here. Renew the alert before it expires.</li>
              <li>At Topstep, on every account: Auto OCO Brackets on, Topstep&apos;s own trade copier off, Personal Daily Profit Target &quot;Do Nothing&quot; or above the script&apos;s.</li>
              <li>Every card starts as a dry run: it logs each decision with prices and places nothing. Run at least a week, check it in Dry-run check, then switch cards to real orders one at a time.</li>
            </ol>
          </div>
          <div>
            <AlertExpiry initial={s.alertExpires} />
            <Copy label="Webhook URL" value={`${origin}/api/bot/webhook`} />
            <p className="mt-4 font-mono text-[10.5px] leading-[1.8] text-ink-4">
              The secret lives only in Vercel and TradingView: it&apos;s never shown here, logged or stored in the database. Anyone without it is turned away, and a repeat of a signal id already handled is ignored, so a retry can&apos;t double a trade. (Older strategy scripts used this message instead: {ALERT_MESSAGE})
            </p>
          </div>
        </div>
      </Section>

      <Section id="log" n={10} label="Log">
        <ul>
          {s.events.length === 0 && <li className="font-mono text-[11.5px] text-ink-3">Quiet so far.</li>}
          {s.events.map((e, i) => (
            <li key={i} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 border-b border-line py-2 font-mono text-[10.5px] max-sm:grid-cols-1">
              <span className="text-ink-4">{when(e.at)}</span>
              <span className={e.level === "error" ? "text-neg" : e.level === "warn" ? "text-gold" : "text-ink-3"}>{e.message}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
