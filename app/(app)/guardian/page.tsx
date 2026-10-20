import { getSettings } from "@/lib/data/settings";
import { listTrades } from "@/lib/data/trades";
import { listBrokerAccounts } from "@/lib/data/connections";
import { listLedger } from "@/lib/data/ledger";
import { listJournalDays } from "@/lib/data/journal";
import { roadToPaid } from "@/lib/analytics/road";
import { GRAINS, mindSummary, mindTimeline, type Grain, type MindRow } from "@/lib/analytics/mind";
import { addDays, todayKey } from "@/lib/analytics/time";
import { propStatus, simulateProp } from "@/lib/analytics/prop";
import { FIRM_SUGGESTIONS, firmKey, summarizeLedger } from "@/lib/analytics/ledger";
import { Section } from "@/components/m";
import { SectionIndex } from "@/components/m/SectionIndex";
import { GuardianHero } from "@/components/guardian/GuardianHero";
import { GuardianQuote, OddsSection, StatusSection } from "@/components/guardian/GuardianView";
import { Explainer } from "@/components/guardian/Explainer";
import { LedgerSection } from "@/components/guardian/Ledger";
import { RoadSection } from "@/components/guardian/Road";
import { MindSection } from "@/components/guardian/Mind";
import { PlanSection, type PlanFirm } from "@/components/guardian/Plan";
import { PropForm } from "@/components/guardian/PropForm";

export const metadata = { title: "Guardian" };

export default async function GuardianPage() {
  const settings = await getSettings();
  const prop = settings.prop;
  const tz = settings.profile.timezone;
  const today = todayKey(tz);
  // Three years is plenty for the year-by-year view.
  const from = addDays(today, -1100);
  const [trades, accounts, ledger, history, journals] = await Promise.all([
    prop.enabled ? listTrades({ since: new Date(`${addDays(prop.startDate, -1)}T00:00:00Z`) }) : Promise.resolve([]),
    listBrokerAccounts(),
    listLedger(),
    listTrades({ since: new Date(`${from}T00:00:00Z`) }),
    listJournalDays(from, today),
  ]);

  const st = prop.enabled ? propStatus(trades, prop, tz) : null;
  // A breached account has no future to simulate: every path would start below the line.
  const mc = st && !st.breached ? simulateProp(st, prop, { sims: 4000, horizon: 30 }) : null;
  const target = st && prop.profitTarget !== null ? prop.startBalance + (st.requiredProfit ?? prop.profitTarget) : null;
  const tracked = prop.accountIds.length === 1 ? accounts.find((a) => a.id === prop.accountIds[0]) : null;

  const summary = summarizeLedger(ledger);
  const road = roadToPaid(ledger, summary.cost, today);
  // The firms you trade lead the planner, then any other firm the ledger knows.
  const planFirms: PlanFirm[] = [...new Map(["Topstep", "Tradeify", "Lucid", ...road.byFirm.map((f) => f.firm)].map((f) => [firmKey(f), f])).values()].map((firm) => {
    const r = road.byFirm.find((f) => firmKey(f.firm) === firmKey(firm));
    return { firm, counts: r?.counts ?? null, medians: { daysToPass: r?.daysToPass.median ?? null, daysToPayout: r?.daysPassToPayout.median ?? null } };
  });
  const pooled: PlanFirm = { firm: "All", counts: road.counts, medians: { daysToPass: road.daysToPass.median, daysToPayout: road.daysPassToPayout.median } };
  const mind = Object.fromEntries(GRAINS.map((g) => [g, mindTimeline(history, journals, tz, g)])) as Record<Grain, MindRow[]>;
  const mood = mindSummary(history, journals, tz);
  // The firm being tracked leads the form's suggestions, then firms already in the ledger.
  const firms = [...new Map([prop.firm, ...summary.byFirm.map((f) => f.firm), ...FIRM_SUGGESTIONS].filter(Boolean).map((f) => [firmKey(f), f])).values()];

  let n = 0;
  const ids = st ? ["top", "status", "odds", "ledger", "road", "plan", "mind", "rules"] : ["top", "watch", "ledger", "road", "plan", "mind", "rules"];

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

      <LedgerSection entries={ledger} summary={summary} n={++n} today={today} firms={firms} />
      <RoadSection road={road} n={++n} />
      <PlanSection n={++n} initial={settings.plan} pooled={pooled} firms={planFirms} />
      <MindSection rows={mind} summary={mood} n={++n} today={today} />

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
