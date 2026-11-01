import "server-only";
import { telegramConfigured } from "./notify";

/** BOT_WEBHOOK_SECRET, or the old mnq-bot's WEBHOOK_SECRET so it can be copied across unchanged. */
export const webhookSecret = () => (process.env.BOT_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "").trim();

/** What's set up, as yes/no only: never the values. (TopstepX lives only on your Mac.) */
export function botSetup() {
  return { secret: webhookSecret().length >= 16, telegram: telegramConfigured() };
}
