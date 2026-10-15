/** Slow-drifting colour fields behind everything — the "studio lighting". */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-[30%] -left-[10%] h-[70vh] w-[70vw] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(94,92,230,0.22),transparent)] blur-3xl" />
      <div
        className="absolute -right-[15%] top-[30%] h-[60vh] w-[55vw] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(191,90,242,0.14),transparent)] blur-3xl"
        style={{ animationDelay: "-6s" }}
      />
      <div
        className="absolute -bottom-[25%] left-[20%] h-[50vh] w-[60vw] animate-drift rounded-full bg-[radial-gradient(closest-side,rgba(100,210,255,0.1),transparent)] blur-3xl"
        style={{ animationDelay: "-12s" }}
      />
    </div>
  );
}
