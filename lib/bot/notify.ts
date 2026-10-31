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
