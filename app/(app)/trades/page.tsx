import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { PageHeader } from "@/components/ui/Card";
import { TradeList } from "@/components/trades/TradeList";

export const metadata = { title: "Trades" };

export default async function TradesPage() {
  const settings = await getSettings();
  const trades = await listTrades({ limit: 5000 });
  return (
    <>
      <PageHeader eyebrow="Every execution, paired and costed" title="Trades" />
      <TradeList trades={trades} tz={settings.profile.timezone} setups={settings.vocab.setups} />
    </>
  );
}
