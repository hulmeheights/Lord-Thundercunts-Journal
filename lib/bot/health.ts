/**
 * Strategy health (S1 = MNQ Session Open Reversal): profit factor over the
 * last 60 trades (PF60). Tracking only: it never stops, pauses or changes a
 * trade. It warns when PF60 falls below 1.0 (the strategy is losing more than
 * it makes) and says when it's back. Pure, so it's unit-tested.
 */

/** 60 backtest trades up to 3 Nov 2026, oldest first, $ at 5 MNQ, so PF60 means something from day one (≈1.27). */
export const HEALTH_PRELOAD: readonly number[] = [
  -466, -599, 141, -244, -249, -411, 141, -249, -374, 1964, -294, -274, -339, -579, 1591, -334, -516, 1591, -299, -381, -686, 1591, -314, -281, 141, 1591, -234, -399, 141, -574, 1591, 1591, -1, -651, 434, 141, 1456, -276, -391, 141, 141, -304, -171, -526, -521, 879, 711, 939, -214, -294, -626, -279, -601, -356, -496, -576, -364, 754, -371, 1591,
];
export const HEALTH_WINDOW = 60;

/** A closed bot trade, as kept in the book. */
export type HealthRow = { id: string; tvId: string | null; signalId: string | null; mode: string; qty: number; pnl: number; exitedAt: string };

/**
 * One trade per signal, oldest first, scaled to 5 MNQ (the backtest's size).
 * The same signal filled on several accounts counts once: from a real account
 * if it went live anywhere, else from the dry run / paper book. Test signals
 * don't count. P&L is already after fees (Topstep's for real trades,
 * the strategy's commission for dry runs).
 */
export function onePerSignal(rows: HealthRow[]): { key: string; pnl: number; at: string }[] {
  const best = new Map<string, HealthRow>();
  for (const r of rows) {
    if (!(r.qty > 0) || !Number.isFinite(r.pnl)) continue;
    if ((r.tvId ?? "").endsWith("-TEST")) continue;
    const key = r.tvId ?? r.signalId ?? r.id;
    const had = best.get(key);
    if (!had || (had.mode !== "live" && r.mode === "live")) best.set(key, r);
  }
  return [...best.entries()]
    .map(([key, r]) => ({ key, pnl: Math.round(((r.pnl * 5) / r.qty) * 100) / 100, at: r.exitedAt }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}

/** Gross wins ÷ gross losses (null with no losses). */
export function profitFactor(pnls: readonly number[]): number | null {
  let w = 0;
  let l = 0;
  for (const p of pnls) p > 0 ? (w += p) : (l -= p);
  return l > 0 ? w / l : null;
}

export type Health = { pf60: number | null; n: number; real: number; ok: boolean; window: number[] };

/** The last 60: the preload, pushed out one by one by real trades. */
export function health(real: readonly number[]): Health {
  const window = [...HEALTH_PRELOAD, ...real].slice(-HEALTH_WINDOW);
  const pf60 = profitFactor(window);
  return { pf60, n: window.length, real: Math.min(real.length, HEALTH_WINDOW), ok: pf60 === null || pf60 >= 1, window };
}

export const pfFmt = (pf: number | null) => (pf === null ? "∞" : pf.toFixed(2));
export const healthWarning = (pf: number | null) => `⚠️ S1 health: PF60 = ${pfFmt(pf)} (below 1.0). Strategy may have stopped working.\nAutopilot is still trading: this is a warning only. Switch it off yourself if you want it to stop.`;
export const healthBack = (pf: number | null) => `✅ S1 health back: PF60 = ${pfFmt(pf)}`;
export const healthWeekly = (h: Health) => `S1 PF60 = ${pfFmt(h.pf60)} (${h.n} trades)\n${h.real} real, ${h.n - h.real} from the backtest · ${h.ok ? "healthy" : "below 1.0: keep an eye on it"}`;

/** Sunday at or after 18:00 in London, and no weekly message in the last 6 days. */
export function weeklyDue(now: Date, lastSent: Date | null): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (day !== "Sun" || !(hour >= 18)) return false;
  return !lastSent || now.getTime() - lastSent.getTime() > 6 * 86_400_000;
}

/** Eval sets of 5 that failed back to back: 2 in a row is the spend limit. */
export const SPEND_LIMIT_SETS = 2;
