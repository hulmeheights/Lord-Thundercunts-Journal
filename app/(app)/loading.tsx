/** A hairline that fills while the next page is read, like the opening sequence. */
export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] flex-col justify-center" aria-busy="true" aria-label="Loading">
      <div className="relative h-px w-[min(58vw,420px)] overflow-hidden bg-line">
        <i className="absolute inset-y-0 left-0 block w-1/3 bg-ink motion-safe:animate-[ltj-load_1.4s_cubic-bezier(0.16,1,0.3,1)_infinite]" />
      </div>
      <div className="mt-6 font-mono text-[10px] tracking-[0.3em] text-ink-4 uppercase">Reading the tape</div>
      <style>{"@keyframes ltj-load{from{transform:translateX(-100%)}to{transform:translateX(300%)}}"}</style>
    </div>
  );
}
