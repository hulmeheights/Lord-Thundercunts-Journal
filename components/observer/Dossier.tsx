import type { Fact, Want } from "@/lib/analytics/observer";
import { Row, Rows } from "@/components/m";
import { Figures } from "./ui";

const delay = (d: number) => ({ "--d": `${d}ms` }) as React.CSSProperties;

const SOURCE: Record<Want["source"], (name: string) => string> = {
  stated: (n) => `In your words, about ${n}`,
  prop: () => "The account",
  rules: () => "The rules",
  intention: () => "The last intention",
};

/** 01 — the wants, as sentences rather than a list. */
export function Wants({ wants, name }: { wants: Want[]; name: string }) {
  return (
    <div className="space-y-[clamp(2.6rem,7vh,4.2rem)]">
      {wants.map((w, i) => (
        <div
          key={w.text}
          className="reveal grid grid-cols-1 gap-x-[clamp(1.2rem,4vw,3.5rem)] gap-y-4 md:grid-cols-[2.5rem_minmax(0,1fr)]"
          style={delay(i * 90)}
        >
          <span className="font-mono text-[11px] tracking-[0.1em] text-gold max-md:hidden">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <div className="eyebrow mb-4 !text-[9.5px]">{SOURCE[w.source](name)}</div>
            <p className="max-w-[30ch] font-serif text-[clamp(1.35rem,2.9vw,2.15rem)] leading-[1.32] font-light tracking-[-0.01em] text-ink">
              <Figures text={w.text} />
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 02 — what the trades say, then what's working, in jade. */
export function Doing({ doing, strengths, name }: { doing: Fact[]; strengths: Fact[]; name: string }) {
  return (
    <div>
      <Rows>
        {doing.map((f, i) => (
          <Row key={f.title} i={String(i + 1).padStart(2, "0")} d={i * 70} title={f.title} desc={<Figures text={f.text} />} />
        ))}
      </Rows>

      {strengths.length > 0 && (
        <div className="pt-[clamp(4rem,10vh,6.5rem)]">
          <div className="reveal mb-[clamp(1.6rem,4vh,2.4rem)] flex flex-wrap items-baseline justify-between gap-4">
            <div className="font-mono text-[10px] tracking-[0.4em] text-pos uppercase">
              <span aria-hidden className="mr-3 text-[8px]">◆</span>Working
            </div>
            <span className="font-mono text-[10px] tracking-[0.18em] text-ink-4 uppercase">A fair observer says this too</span>
          </div>
          <Rows>
            {strengths.map((f, i) => (
              <Row
                key={f.title}
                i={<span className="text-pos">+</span>}
                d={i * 70}
                title={f.title}
                desc={<Figures text={f.text} />}
              />
            ))}
          </Rows>
          <p className="reveal mt-[clamp(1.6rem,4vh,2.4rem)] max-w-[52ch] font-mono text-[11px] leading-[1.9] tracking-[0.03em] text-ink-4">
            This is {name}&apos;s edge. Everything in the next section is about not giving it back.
          </p>
        </div>
      )}
    </div>
  );
}
