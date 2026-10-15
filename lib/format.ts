const MINUS = "−";

export function fmtMoney(n: number, opts: { sign?: boolean; cents?: boolean; compact?: boolean; compactFrom?: number } = {}): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  let body: string;
  if (opts.compact && abs >= (opts.compactFrom ?? 10_000)) {
    body = abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M` : `${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  } else {
    const showCents = opts.cents ?? abs < 100;
    const digits = showCents ? 2 : 0;
    body = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  const sign = n < 0 ? MINUS : opts.sign && n > 0 ? "+" : "";
  return `${sign}$${body}`;
}

export function fmtPct(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "∞";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const decimals = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 10 ? 2 : 4;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function pnlTone(n: number): "pos" | "neg" | "flat" {
  return n > 0.004 ? "pos" : n < -0.004 ? "neg" : "flat";
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
