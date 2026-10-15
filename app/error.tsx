"use client";

import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-orange/15 text-orange">
          <TriangleAlert size={24} />
        </div>
        <h1 className="title-lg">Something went sideways.</h1>
        <p className="mt-2 text-[14px] text-ink-3">The error has been contained. Try again — if it persists, check the database connection in Vercel.</p>
        <button onClick={reset} className="mt-5 h-10 rounded-full bg-ink px-5 text-[14px] font-semibold text-bg">
          Try again
        </button>
      </div>
    </div>
  );
}
