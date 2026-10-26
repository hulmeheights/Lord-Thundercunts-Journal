/**
 * Inactivity watch: each firm closes accounts left without a trade for so many
 * days, and every firm counts differently. A rule per firm says how long, how
 * it counts, when to warn and how many accounts you must hold there before it
 * switches on; this works out which accounts are running short and the push
 * that says so. Pure, so the counting is tested.
 */
import { z } from "zod";
import { addDays, fmtMinute, parseHHMM, weekdayIndex } from "./time";
import type { Reminder } from "./notify";

export const InactivityRule = z.object({
  id: z.string().regex(/^[a-z0-9]{4,16}$/),
  firm: z.string().trim().min(1, "Name the firm").max(40),
  enabled: z.boolean(),
  /** The firm's limit: an account with no trade for this many days is closed. */
  days: z.number().int().min(1).max(365),
  unit: z.enum(["calendar", "trading"]),
  /** Warn when this many days (or fewer) are left. */
  warnBefore: z.number().int().min(0).max(60),
  /** Only watch the firm once you hold at least this many accounts there. */
  minAccounts: z.number().int().min(1).max(50),
  sendAt: z.enum(["checkin", "pre", "time"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  repeat: z.enum(["once", "daily"]),
});
export type InactivityRule = z.infer<typeof InactivityRule>;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** An account you added by hand, e.g. one bought today with no trades yet. */
export const ManualAccount = z.object({ id: z.string().max(200), name: z.string().trim().min(1, "Name the account").max(80), since: Day });
export type ManualAccount = z.infer<typeof ManualAccount>;

export const InactivitySettings = z.object({
  rules: z.array(InactivityRule).max(20),
  /** Account id → firm, for accounts whose firm you set by hand. */
  firmOf: z.record(z.string().max(200), z.string().trim().max(40)),
  /** Accounts taken off the watch list. Only the list: their trades and stats stay. */
  hidden: z.array(z.string().max(200)).max(500).default([]),
  /** Accounts added by hand. */
  manual: z.array(ManualAccount).max(100).default([]),
});
export type InactivitySettings = z.infer<typeof InactivitySettings>;

export const DEFAULT_INACTIVITY: InactivitySettings = { rules: [], firmOf: {}, hidden: [], manual: [] };

/** The id an import gives an account name, so a name typed here and the same name in an export are one account. */
export const importId = (name: string) => `import:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "account"}`;
const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The known account a typed name refers to, by import id or by name. */
export const findAccount = (name: string, all: readonly WatchedAccount[]) => all.find((a) => a.id === importId(name) || sameName(a.name, name));

/**
 * The watch list: accounts the journal found, plus the ones you added, minus
 * the ones you removed, with the firms you set. A hand-added account takes
 * over as soon as its trades arrive (same name), keeping its firm.
 */
export function watchList(found: readonly WatchedAccount[], s: InactivitySettings): WatchedAccount[] {
  const out: WatchedAccount[] = found.map((a) => {
    const m = s.manual.find((x) => x.id === a.id || sameName(x.name, a.name));
    return { ...a, firm: s.firmOf[a.id] || (m && s.firmOf[m.id]) || a.firm, since: m && !a.lastTrade ? m.since : a.since };
  });
  for (const m of s.manual) if (!findAccount(m.name, found)) out.push({ id: m.id, name: m.name, firm: s.firmOf[m.id] ?? "", lastTrade: null, since: m.since });
  const hidden = new Set(s.hidden);
  return out.filter((a) => !hidden.has(a.id));
}

export const newRule = (firm: string): InactivityRule => ({
  id: Math.random().toString(36).slice(2, 10).padEnd(4, "0"),
  firm,
  enabled: true,
  days: 7,
  unit: "calendar",
  warnBefore: 2,
  minAccounts: 5,
  sendAt: "checkin",
  time: "12:00",
  repeat: "daily",
});

export type WatchedAccount = { id: string; name: string; firm: string; lastTrade: string | null; since: string };

export const sameFirm = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Idle days so far, counted the firm's way (trading days skip Saturdays and Sundays). */
export function idleDays(from: string, today: string, unit: InactivityRule["unit"]): number {
  let n = 0;
  for (let d = addDays(from, 1); d <= today; d = addDays(d, 1)) if (unit === "calendar" || weekdayIndex(d) < 5) n++;
  return n;
}

export type AtRisk = { account: WatchedAccount; idle: number; left: number };

/** Accounts at a firm that are within the warning window (or already past the limit). */
export function atRisk(rule: InactivityRule, accounts: readonly WatchedAccount[], today: string): { held: number; risky: AtRisk[] } {
  const mine = accounts.filter((a) => sameFirm(a.firm, rule.firm));
  if (!rule.enabled || mine.length < rule.minAccounts) return { held: mine.length, risky: [] };
  const risky = mine
    .map((a) => {
      const idle = idleDays(a.lastTrade ?? a.since, today, rule.unit);
      return { account: a, idle, left: rule.days - idle };
    })
    .filter((r) => r.left <= rule.warnBefore)
    .sort((x, y) => x.left - y.left);
  return { held: mine.length, risky };
}

const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The push for one firm, if it's due now. */
export function inactivityReminder(i: { rule: InactivityRule; accounts: readonly WatchedAccount[]; today: string; minute: number; sessionStart: number | null }): Reminder | null {
  const { rule } = i;
  const { held, risky } = atRisk(rule, i.accounts, i.today);
  if (!risky.length) return null;
  // When to send: with the 12:00 check-in, in the 90 minutes before your window, or at your own time (each within an hour).
  const from = rule.sendAt === "checkin" ? 12 * 60 : rule.sendAt === "pre" ? (i.sessionStart ?? 14 * 60 + 30) - 90 : parseHHMM(rule.time)!;
  const until = rule.sendAt === "pre" ? (i.sessionStart ?? 14 * 60 + 30) : from + 60;
  if (i.minute < from || i.minute >= until) return null;

  const soonest = risky[0]!;
  const unit = rule.unit === "trading" ? "trading day" : "day";
  const gone = soonest.left <= 0;
  const oldest = risky.map((r) => r.account.lastTrade ?? r.account.since).sort()[0]!;
  const title = gone ? `${rule.firm}: past the ${plural(rule.days, unit)} limit` : `${rule.firm}: ${plural(soonest.left, `${unit}`)} left`;
  const who = risky.length === held && held > 1 ? `All ${held} accounts` : `${risky.length} of ${held} ${held === 1 ? "account" : "accounts"}`;
  const body = [
    `${who} ${risky.length === 1 ? "hasn't" : "haven't"} traded since ${date(oldest)}${risky.length <= 3 ? ` (${risky.map((r) => r.account.name).join(", ")})` : ""}.`,
    gone ? "Check them now: the firm may already treat them as inactive." : "Place a keep-alive trade (1 micro) in your window today.",
  ].join(" ");
  // Once: re-arms only after a trade moves the oldest date. Daily: every day until then.
  const key = rule.repeat === "once" ? `${rule.id}:${oldest}` : `${rule.id}:${i.today}`;
  return { kind: "inactive", key, title, body, url: "/settings#notifications" };
}

export const describeSend = (r: InactivityRule) => (r.sendAt === "checkin" ? "with the 12:00 check-in" : r.sendAt === "pre" ? "before your window" : `at ${fmtMinute(parseHHMM(r.time)!)}`);
