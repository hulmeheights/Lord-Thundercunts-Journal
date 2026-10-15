import { ShieldCheck } from "lucide-react";
import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { listBrokerAccounts } from "@/lib/data/connections";
import { addDays } from "@/lib/analytics/time";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { GuardianView } from "@/components/guardian/GuardianView";
import { PropForm } from "@/components/guardian/PropForm";

export const metadata = { title: "Guardian" };

export default async function GuardianPage() {
  const settings = await getSettings();
  const prop = settings.prop;
  const [trades, accounts] = await Promise.all([
    listTrades({ since: new Date(`${addDays(prop.startDate, -1)}T00:00:00Z`) }),
    listBrokerAccounts(),
  ]);
  const tracked = prop.accountIds.length === 1 ? accounts.find((a) => a.id === prop.accountIds[0]) : null;
  return (
    <>
      <PageHeader eyebrow={`${prop.firm} · ${prop.preset} ${prop.phase === "combine" ? "Combine" : "Funded"}`} title="Prop Guardian" />
      <div className="space-y-5">
        {prop.enabled ? (
          <GuardianView trades={trades} prop={prop} tz={settings.profile.timezone} brokerBalance={tracked?.balance ?? null} />
        ) : (
          <Card className="text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-blue/15 text-blue">
              <ShieldCheck size={30} />
            </div>
            <h2 className="title-lg">Never blow an evaluation by accident</h2>
            <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-3">
              Guardian replays your account against your firm&apos;s rules — trailing max loss, daily limit, consistency — and simulates thousands of
              futures from your own trading days to tell you your odds of passing.
            </p>
          </Card>
        )}
        <Card>
          <CardHeader eyebrow="Account rules" title="Your evaluation" />
          <PropForm initial={prop} accounts={accounts} />
        </Card>
      </div>
    </>
  );
}
