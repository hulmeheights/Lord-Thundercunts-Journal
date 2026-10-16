import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { listBrokerAccounts } from "@/lib/data/connections";
import { listLedger } from "@/lib/data/ledger";
import { addDays, todayKey } from "@/lib/analytics/time";
import { propStatus, simulateProp } from "@/lib/analytics/prop";
import { FIRM_SUGGESTIONS, firmKey, summarizeLedger } from "@/lib/analytics/ledger";
import { Section } from "@/components/m";
import { SectionIndex } from "@/components/m/SectionIndex";
import { GuardianHero } from "@/components/guardian/GuardianHero";
import { GuardianQuote, OddsSection, StatusSection } from "@/components/guardian/GuardianView";
import { Explainer } from "@/components/guardian/Explainer";
import { LedgerSection } from "@/components/guardian/Ledger";
import { PropForm } from "@/components/guardian/PropForm";

export const metadata = { title: "Guardian" };

export default async function GuardianPage() {
  const settings = await getSettings();
  const prop = settings.prop;
  const tz = settings.profile.timezone;
  const [trades, accounts, ledger] = await Promise.all([
    prop.enabled ? listTrades({ since: new Date(`${addDays(prop.startDate, -1)}T00:00:00Z`) }) : Promise.resolve([]),
    listBrokerAccounts(),
    listLedger(),
  ]);

  const st = prop.enabled ? propStatus(trades, prop, tz) : null;
  // A breached account has no future to simulate: every path would start below the line.
  const mc = st && !st.breached ? simulateProp(st, prop, { sims: 4000, horizon: 30 }) : null;
  const target = st && prop.profitTarget !== null ? prop.startBalance + (st.requiredProfit ?? prop.profitTarget) : null;
  const tracked = prop.accountIds.length === 1 ? accounts.find((a) => a.id === prop.accountIds[0]) : null;

  const summary = summarizeLedger(ledger);
  // The firm being tracked leads the form's suggestions, then firms already in the ledger.
  const firms = [...new Map([prop.firm, ...summary.byFirm.map((f) => f.firm), ...FIRM_SUGGESTIONS].filter(Boolean).map((f) => [firmKey(f), f])).values()];

  let n = 0;
  const ids = st ? ["top", "status", "odds", "ledger", "rules"] : ["top", "watch", "ledger", "rules"];

  return (
    <>
      <SectionIndex ids={ids} />
      <GuardianHero prop={prop} st={st} />

      {st ? (
        <>
          <StatusSection prop={prop} st={st} mc={mc} brokerBalance={tracked?.balance ?? null} n={++n} />
          <OddsSection prop={prop} st={st} mc={mc} target={target} n={++n} />
          <GuardianQuote />
        </>
      ) : (
        <Explainer n={++n} />
      )}

      <LedgerSection entries={ledger} summary={summary} n={++n} today={todayKey(tz)} firms={firms} />

      <Section
        id="rules"
        n={++n}
        label="Account rules"
        lead={
          <>
            Tell Guardian the rules <em>once</em>.
          </>
        }
      >
        <PropForm initial={prop} accounts={accounts} />
      </Section>
    </>
  );
}
