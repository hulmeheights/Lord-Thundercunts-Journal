import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { listJournalDays } from "@/lib/data/journal";
import { todayKey } from "@/lib/analytics/time";
import { InsightsView } from "@/components/insights/InsightsView";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const settings = await getSettings();
  const [trades, journals] = await Promise.all([listTrades({ limit: 10000 }), listJournalDays("2000-01-01", todayKey(settings.profile.timezone))]);
  return <InsightsView trades={trades} journals={journals} settings={settings} />;
}
