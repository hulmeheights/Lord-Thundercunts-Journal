import { zonedToUtc } from "../analytics/time";

/** "$1,234.50" → 1234.5, "(12.50)" → -12.5, "−$5" → -5, "" → null */
export function parseNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  // Strip currency/spacing first so "$(25.00)" and "($25.00)" both read as -25.
  s = s.replace(/[−–]/g, "-").replace(/[$£€\s]/g, "").replace(/,/g, "");
  if (s.startsWith("-(") && s.endsWith(")")) s = `-${s.slice(2, -1)}`;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export type DateOrder = "MDY" | "DMY";

/**
 * Parses the date/time formats trading platforms export. Strings with an
 * explicit offset or "Z" are absolute; anything else is read as wall-clock
 * time in `tz`.
 */
export function parseDateTime(raw: string | undefined | null, tz: string, order: DateOrder = "MDY"): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  // Any layout with a trailing UTC offset ("05/07/2024 13:33:37 +00:00", "… -0500", "…Z") is absolute time.
  const off = /\s*(?:(Z)|([+-])(\d{2}):?(\d{2}))$/i.exec(s);
  if (off && !/^\d{4}-\d{2}-\d{2}[T ]/.test(s) && /\d{1,2}:\d{2}/.test(s)) {
    const local = parseDateTime(s.slice(0, off.index), "UTC", order);
    if (!local) return null;
    const minutes = off[1] ? 0 : (off[2] === "-" ? -1 : 1) * (Number(off[3]) * 60 + Number(off[4]));
    return new Date(new Date(local).getTime() - minutes * 60_000).toISOString();
  }

  // ISO-ish with explicit zone: 2026-10-14T13:31:22.123Z / +00:00 / -0400
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s.replace(" ", "T").replace(/\s+/g, "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  let y: number, mo: number, d: number;
  let rest: string;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[T\s]*(.*)$/.exec(s);
  if (m) {
    y = +m[1]!; mo = +m[2]!; d = +m[3]!; rest = m[4]!;
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})[,\s]*(.*)$/.exec(s);
    if (!m) {
      const t = Date.parse(s);
      return Number.isNaN(t) ? null : new Date(t).toISOString();
    }
    let a = +m[1]!, b = +m[2]!;
    y = +m[3]!;
    if (y < 100) y += 2000;
    if (a > 12) order = "DMY";
    else if (b > 12) order = "MDY";
    [mo, d] = order === "MDY" ? [a, b] : [b, a];
    rest = m[4]!;
  }
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(AM|PM)?/i.exec(rest.trim());
  let h = 0, mi = 0, sec = 0, ms = 0;
  if (t) {
    h = +t[1]!; mi = +t[2]!; sec = t[3] ? +t[3] : 0; ms = t[4] ? Math.round(Number(`0.${t[4]}`) * 1000) : 0;
    const ap = t[5]?.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 60) return null;
  const day = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const base = zonedToUtc(day, h * 60 + mi, tz);
  return new Date(base.getTime() + sec * 1000 + ms).toISOString();
}

/** "Buy"/"B"/"Long"/"Bot" → buy, "Sell"/"S"/"Short"/"Sld" → sell */
export function parseSide(raw: string | undefined | null): "buy" | "sell" | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(b|buy|bought|bot|long|0|bid)$/.test(s) || s.startsWith("buy")) return "buy";
  if (/^(s|sell|sold|sld|short|1|ask)$/.test(s) || s.startsWith("sell")) return "sell";
  return null;
}
