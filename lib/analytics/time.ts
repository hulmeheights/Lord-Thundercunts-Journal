/** Timezone-aware calendar helpers. Day keys are always "YYYY-MM-DD" strings. */

const dayFmtCache = new Map<string, Intl.DateTimeFormat>();
const timeFmtCache = new Map<string, Intl.DateTimeFormat>();

function dayFmt(tz: string) {
  let f = dayFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFmtCache.set(tz, f);
  }
  return f;
}

function timeFmt(tz: string) {
  let f = timeFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFmtCache.set(tz, f);
  }
  return f;
}

export function dayKey(iso: string | Date, tz: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dayFmt(tz).format(d);
}

export function todayKey(tz: string): string {
  return dayKey(new Date(), tz);
}

/** Minutes since local midnight in the given timezone. */
export function minuteOfDay(iso: string, tz: string): number {
  const parts = timeFmt(tz).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + m;
}

export function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtMinute(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toUTCDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function fromUTCDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = toUTCDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTCDate(d);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(day: string): number {
  return (toUTCDate(day).getUTCDay() + 6) % 7;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function startOfWeek(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: string): string {
  const d = toUTCDate(startOfMonth(day));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUTCDate(d);
}

export function addMonths(day: string, n: number): string {
  const d = toUTCDate(startOfMonth(day));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromUTCDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTCDate(b).getTime() - toUTCDate(a).getTime()) / 86_400_000);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isWeekend(day: string): boolean {
  return weekdayIndex(day) >= 5;
}

export function longDate(day: string): string {
  const d = toUTCDate(day);
  return `${WEEKDAYS_LONG[weekdayIndex(day)]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function shortDate(day: string): string {
  const d = toUTCDate(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
}

export function monthLabel(day: string): string {
  const d = toUTCDate(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function holdMinutes(entryIso: string, exitIso: string): number {
  return Math.max(0, (new Date(exitIso).getTime() - new Date(entryIso).getTime()) / 60_000);
}

export function fmtHold(min: number): string {
  if (min < 1) return `${Math.max(1, Math.round(min * 60))}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function timeInTz(iso: string, tz: string): string {
  return timeFmt(tz).format(new Date(iso));
}

const fullFmtCache = new Map<string, Intl.DateTimeFormat>();
function tzOffsetMs(instant: number, tz: string): number {
  let f = fullFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fullFmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUTC - Math.floor(instant / 1000) * 1000;
}

/** Converts a wall-clock time (day + minutes after midnight) in `tz` to a UTC Date. */
export function zonedToUtc(day: string, minute: number, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, 0, 0, 0) + minute * 60_000;
  const off = tzOffsetMs(guess, tz);
  let t = guess - off;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return new Date(t);
}
