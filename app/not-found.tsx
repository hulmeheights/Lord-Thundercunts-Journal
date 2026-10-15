import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="text-brand font-[family-name:var(--font-display)] text-[72px] font-black tracking-[-0.05em]">404</div>
        <p className="mt-1 text-[15px] text-ink-3">Nothing here, my Lord.</p>
        <Link href="/" className="mt-5 inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-bg">
          Back to Today
        </Link>
      </div>
    </div>
  );
}
