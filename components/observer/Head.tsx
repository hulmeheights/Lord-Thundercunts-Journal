import { RevealText } from "@/components/motion/RevealText";
import { Rise } from "./Rise";

/**
 * The kit's PageHead, entering through React state rather than the global
 * `.reveal` class — it sits above the fold, where that class races hydration.
 */
export function ObserverHead({ eyebrow, title, meta }: { eyebrow: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <header className="pt-6 pb-[clamp(3rem,8vh,5.5rem)] sm:pt-10">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-7">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <Rise className="eyebrow mb-[clamp(1.4rem,3.5vh,2.4rem)] !tracking-[0.42em]">{eyebrow}</Rise>
          <RevealText as="h1" delay={0.1} className="max-w-[18ch] font-serif text-[clamp(2.6rem,7vw,6rem)] leading-[1] font-light tracking-[-0.01em] [&_em]:italic">
            {title}
          </RevealText>
        </div>
        {meta && (
          <Rise d={200} className="shrink-0 text-right font-mono max-sm:text-left">
            {meta}
          </Rise>
        )}
      </div>
    </header>
  );
}
