/** A single, barely-there wash of mint light at the top of the page. */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh] overflow-hidden">
      <div className="absolute -top-[40vh] left-1/2 h-[80vh] w-[120vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--glow)_10%,transparent),transparent)]" />
    </div>
  );
}
