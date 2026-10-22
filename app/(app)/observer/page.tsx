import { aiConfigured } from "@/lib/env";
import { getSettings } from "@/lib/data/settings";
import { listObserverSessions, loadDossier, loadPinnedOrder, type ObserverWindow } from "@/lib/data/observer";
import { instructionInPlace } from "@/lib/analytics/observer";
import { shortDate } from "@/lib/analytics/time";
import { plural } from "@/lib/format";
import { Dot, Quote, Section } from "@/components/m";
import { quoteOfDay } from "@/lib/quotes";
import { Seg } from "@/components/m/Seg";
import { Manifesto } from "@/components/m/Manifesto";
import { SectionIndex } from "@/components/m/SectionIndex";
import { RitualHost, StepOutside } from "@/components/observer/Shell";
import { ObserverHead } from "@/components/observer/Head";
import { Rise } from "@/components/observer/Rise";
import { Doing, Wants } from "@/components/observer/Dossier";
import { Obstacles } from "@/components/observer/Obstacles";
import { OrderPanel } from "@/components/observer/Order";
import { TellItem } from "@/components/observer/Tell";
import { SessionHistory } from "@/components/observer/SessionHistory";

export const metadata = { title: "Observer" };

export default async function ObserverPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const window: ObserverWindow = sp.window === "90" ? 90 : 30;
  const [settings, sessions] = await Promise.all([getSettings(), listObserverSessions(12)]);
  // What was last written about wanting becomes the first "want" the Observer reads back.
  const statedWant = sessions.find((s) => s.wants)?.wants ?? null;
  const [{ dossier, today }, order] = await Promise.all([loadDossier(window, statedWant), loadPinnedOrder(settings)]);

  const n = dossier.name;
  const nowCost = Object.fromEntries(dossier.stopping.map((o) => [o.key, Math.round(o.cost)]));
  const todaySession = sessions[0]?.day === today ? sessions[0] : null;
  const quote = quoteOfDay(today);
  const aiReady = aiConfigured() && settings.ai.enabled;
  const stopping = dossier.stopping.slice(0, 5);
  const sections = ["top", ...(order ? ["order"] : []), "wants", "doing", "stopping", "tell", "history"];
  let k = 0;

  return (
    <>
      <SectionIndex ids={sections} />

      <ObserverHead
        eyebrow="The Observer · your trading, seen from the outside"
        title={
          <>
            Meet <em>{n}</em>.
          </>
        }
        meta={
          <div className="flex flex-col items-end gap-4 max-sm:items-start">
            <Seg
              value={String(window)}
              options={[
                { value: "30", label: "30 days", href: "/observer" },
                { value: "90", label: "90 days", href: "/observer?window=90" },
              ]}
            />
            <div className="flex items-center gap-2.5 font-mono text-[9px] tracking-[0.3em] text-ink-4 uppercase">
              <Dot />
              {shortDate(dossier.from)} — {shortDate(dossier.to)} · {plural(dossier.sample.trades, "trade")}
            </div>
          </div>
        }
      />

      {/* The Observer's read, then the way in. Above the fold, so it rises through state, not `.reveal`. */}
      <section id="top" className="scroll-mt-24 pb-[clamp(3.5rem,9vh,6.5rem)]">
        <Rise className="mb-[clamp(1.6rem,4vh,2.4rem)] font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase" d={160}>
          — The Observer&apos;s read
        </Rise>
        <Manifesto text={dossier.headlineMd} className="max-w-[24ch]" />
        <Rise d={120} className="mt-[clamp(2rem,5vh,3rem)]">
          <p className="max-w-[44ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2">
            People reason more wisely about a friend&apos;s problems than their own — psychologists call it Solomon&apos;s paradox. So for
            three minutes, {n} isn&apos;t you. You&apos;re the calm coach across the room who has watched every trade.
          </p>
          {dossier.sample.low && (
            <p className="mt-4 max-w-[44ch] font-mono text-[11px] leading-[1.9] tracking-[0.04em] text-ink-4">A small sample — read these as hunches, not verdicts.</p>
          )}
        </Rise>
        <Rise d={220} className="mt-[clamp(2.4rem,6vh,3.4rem)] flex flex-wrap items-center gap-x-9 gap-y-6">
          <StepOutside>
            Step outside <span aria-hidden>→</span>
          </StepOutside>
          <a href="#wants" className="font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase transition-colors duration-300 hover:text-ink">
            ↓ the case file
          </a>
        </Rise>
      </section>

      {order && (
        <section id="order" className="scroll-mt-24 pb-[clamp(2rem,6vh,4rem)]">
          <OrderPanel order={order} today={today} />
        </section>
      )}

      <Section
        n={++k}
        id="wants"
        label={`What ${n} wants`}
        lead={
          <>
            Start with the <em>point</em> of it all.
          </>
        }
      >
        {dossier.wants.length ? (
          <Wants wants={dossier.wants} name={n} />
        ) : (
          <div className="reveal border-t border-line py-[clamp(2.4rem,6vh,4rem)]">
            <p className="max-w-[30ch] font-serif text-[clamp(1.35rem,2.9vw,2.15rem)] leading-[1.32] font-light text-ink-3">
              Nothing is written down yet. Step outside and put it into words — the Observer reads it back from then on.
            </p>
          </div>
        )}
      </Section>

      <Section
        n={++k}
        id="doing"
        label={`What ${n} is doing`}
        lead={
          <>
            What a camera would <em>see</em>.
          </>
        }
      >
        {dossier.doing.length ? (
          <Doing doing={dossier.doing} strengths={dossier.strengths} name={n} />
        ) : (
          <div className="reveal border-t border-line py-[clamp(2.4rem,6vh,4rem)]">
            <p className="max-w-[24ch] font-serif text-[clamp(1.35rem,2.9vw,2.15rem)] leading-[1.32] font-light">
              No trades in this window. Patience is a <em>position</em>.
            </p>
          </div>
        )}
      </Section>

      <Section
        n={++k}
        id="stopping"
        label={`What's stopping ${n}`}
        lead={
          stopping.length ? (
            <>
              Ranked by what it <em>cost</em>.
            </>
          ) : (
            <>
              Nothing costly stands <em>out</em>.
            </>
          )
        }
      >
        {stopping.length ? (
          <>
            <Obstacles list={stopping} />
            <p className="reveal mt-[clamp(1.6rem,4vh,2.4rem)] max-w-[56ch] font-mono text-[11px] leading-[1.9] tracking-[0.03em] text-ink-4">
              These overlap — one bad trade can be a revenge trade and a rule break at once — so never add them up. Open any row for the
              evidence.
            </p>
          </>
        ) : (
          <p className="reveal max-w-[46ch] border-t border-line pt-[clamp(1.8rem,4vh,2.4rem)] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2">
            {dossier.sample.trades
              ? `Over ${plural(dossier.sample.trades, "trade")}, no habit cost ${n} anything worth naming. That is what discipline looks like.`
              : "Waiting for trades. The Observer only speaks with evidence."}
          </p>
        )}
      </Section>

      <Section
        n={++k}
        id="tell"
        label={`What to tell ${n}`}
        lead={
          dossier.tell.length ? (
            <>
              Say it the way you&apos;d say it to a <em>friend</em>.
            </>
          ) : (
            <>
              Keep doing <em>exactly</em> this.
            </>
          )
        }
      >
        {dossier.tell.length ? (
          <>
            <p className="reveal -mt-[clamp(1rem,3vh,2rem)] mb-[clamp(2.4rem,6vh,3.6rem)] max-w-[52ch] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2">
              Each order is an if-then — the form that actually changes behaviour. Hold {n} to one, or pin it, and the Observer checks every
              session against it from the trades themselves.
            </p>
            <div className="border-b border-line">
              {dossier.tell.map((ins, i) => (
                <TellItem
                  key={ins.obstacle}
                  ins={ins}
                  index={i}
                  name={n}
                  window={window}
                  sessionId={todaySession?.id ?? null}
                  pinned={order?.key === ins.obstacle}
                  inPlace={instructionInPlace(ins, settings.rules, settings.ritual)}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="reveal max-w-[46ch] border-t border-line pt-[clamp(1.8rem,4vh,2.4rem)] font-mono text-[12px] leading-[1.9] tracking-[0.04em] text-ink-2">
            And keep logging, so the Observer can spot the next edge — or the next leak — early.
          </p>
        )}
      </Section>

      <Section
        n={++k}
        id="history"
        label="Every time you stepped outside"
        aside={
          sessions.length > 0 && (
            <StepOutside variant="text">
              Step outside again <span aria-hidden>→</span>
            </StepOutside>
          )
        }
      >
        <SessionHistory sessions={sessions} name={n} nowCost={nowCost} aiReady={aiReady} />
      </Section>

      <div className="pt-[clamp(3rem,8vh,5rem)]">
        <Quote cite={quote.cite}>{quote.text}</Quote>
      </div>

      <footer className="reveal flex flex-col items-center gap-6 pt-[clamp(4.5rem,12vh,8rem)] pb-[clamp(2rem,6vh,4rem)] text-center">
        <span className="text-[11px] text-gold" aria-hidden>
          ◆
        </span>
        <StepOutside variant="text">
          Step outside <span aria-hidden>→</span>
        </StepOutside>
        <p className="font-mono text-[9.5px] tracking-[0.32em] text-ink-4 uppercase">Once a week is enough · Sunday evening works well</p>
      </footer>

      <RitualHost
        name={n}
        tell={dossier.tell}
        window={window}
        aiReady={aiReady}
        prefs={settings.observer}
        pinned={order?.key ?? null}
        initialOpen={sp.ritual === "1"}
      />
    </>
  );
}
