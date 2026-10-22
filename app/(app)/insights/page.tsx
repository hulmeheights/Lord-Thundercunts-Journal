import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { listJournalDays } from "@/lib/data/journal";
import { todayKey } from "@/lib/analytics/time";
import { InsightsView } from "@/components/insights/InsightsView";
import { insightsFacts } from "@/lib/analytics/lines";
import { personalLine } from "@/lib/data/lines";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const settings = await getSettings();
  const [trades, journals] = await Promise.all([listTrades({ limit: 10000 }), listJournalDays("2000-01-01", todayKey(settings.profile.timezone))]);
  const { facts, fallback } = insightsFacts(trades, journals, settings, todayKey(settings.profile.timezone));
  const closing = await personalLine("insights", facts, fallback);
  return <InsightsView trades={trades} journals={journals} settings={settings} closing={closing} />;
}
