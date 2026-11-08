import "server-only";

/** Optional Telegram receipts (TELEGRAM_TOKEN + TELEGRAM_CHAT_ID). Never throws. */
export async function telegram(text: string): Promise<void> {
  const tokenValue = process.env.TELEGRAM_TOKEN?.trim();
  const chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!tokenValue || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${tokenValue}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3500) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // A missed receipt must never stop a trade.
  }
}

export const telegramConfigured = () => !!(process.env.TELEGRAM_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());

/**
 * A bot event to Telegram (if set up), and to your phone only when asked:
 * a trade placed or a trade finished, the moment it happens. The first line
 * is the title. Phone pushes follow the "Autopilot trades" switch in
 * Settings → Notifications. Never throws.
 */
export async function botNotify(text: string, opts: { push?: boolean; telegram?: boolean; critical?: boolean; url?: string } = {}): Promise<void> {
  if (opts.telegram !== false) await telegram(text);
  if (!opts.push) return;
  try {
    const [{ getSettings }, { pushAll }] = await Promise.all([import("../data/settings"), import("../push")]);
    const settings = await getSettings();
    if (settings.notify.autopilot === false) return;
    const [{ tradingQuiet }, { minuteOfDay }] = await Promise.all([import("../analytics/notify"), import("../analytics/time")]);
    if (!opts.critical && tradingQuiet(settings.notify, minuteOfDay(new Date().toISOString(), settings.profile.timezone))) return;
    const [title, ...rest] = text.split("\n");
    await pushAll({ title: title.slice(0, 120), body: rest.join("\n").slice(0, 400) || " ", url: opts.url ?? "/autopilot#ledger", tag: `autopilot:${Date.now()}` });
  } catch {
    // A missed notification must never stop a trade.
  }
}
