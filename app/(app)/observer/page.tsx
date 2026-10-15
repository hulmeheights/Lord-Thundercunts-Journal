import Link from "next/link";
import { aiConfigured } from "@/lib/env";
import { listObserverSessions, loadDossier, type ObserverWindow } from "@/lib/data/observer";
import { PageHeader } from "@/components/ui/Card";
import { ObserverView } from "@/components/observer/ObserverView";
import { cn } from "@/lib/cn";

export const metadata = { title: "Observer" };

export default async function ObserverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const window: ObserverWindow = sp.window === "90" ? 90 : 30;
  const [{ settings, dossier }, sessions] = await Promise.all([loadDossier(window), listObserverSessions(12)]);
  const nowCost = Object.fromEntries(dossier.stopping.map((o) => [o.key, Math.round(o.cost)]));

  return (
    <>
      <PageHeader eyebrow="The Observer · your trading, seen from the outside" title={`Meet ${dossier.name}.`}>
        <div className="inline-flex rounded-full border border-line bg-fill p-1">
          {([30, 90] as const).map((w) => (
            <Link
              key={w}
              href={w === 30 ? "/observer" : "/observer?window=90"}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                w === window ? "bg-ink text-bg" : "text-ink-3 hover:text-ink",
              )}
            >
              {w} days
            </Link>
          ))}
        </div>
      </PageHeader>
      <ObserverView
        dossier={dossier}
        sessions={sessions}
        window={window}
        aiReady={aiConfigured() && settings.ai.enabled}
        prefs={settings.observer}
        nowCost={nowCost}
      />
    </>
  );
}
