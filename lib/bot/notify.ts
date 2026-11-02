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
 * A trade event on your phone (the journal's own notifications) and on
 * Telegram if that's set up. The first line is the title. Phone pushes follow
 * the "Autopilot trades" switch in Settings → Notifications. Never throws.
 */
export async function botNotify(text: string, opts: { push?: boolean } = {}): Promise<void> {
  await telegram(text);
  if (opts.push === false) return;
  try {
    const [{ getSettings }, { pushAll }] = await Promise.all([import("../data/settings"), import("../push")]);
    if ((await getSettings()).notify.autopilot === false) return;
    const [title, ...rest] = text.split("\n");
    await pushAll({ title: `Autopilot · ${title}`.slice(0, 120), body: rest.join("\n").slice(0, 400) || " ", url: "/autopilot#ledger", tag: `autopilot:${Date.now()}` });
  } catch {
    // A missed notification must never stop a trade.
  }
}
