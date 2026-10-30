import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { listBrokerAccounts } from "@/lib/data/connections";
import { TradeList } from "@/components/trades/TradeList";

export const metadata = { title: "Trades" };

export default async function TradesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const [trades, accounts] = await Promise.all([listTrades({ limit: 5000 }), listBrokerAccounts()]);
  return (
    <TradeList
      trades={trades}
      tz={settings.profile.timezone}
      setups={settings.vocab.setups}
      accounts={accounts.map((a) => a.name)}
      openImport={sp.import === "1"}
      defaultRisk={settings.rules.defaultRisk}
      accountRisk={settings.rules.accountRisk}
    />
  );
}
