"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Gallery frame for the trade's chart: a hairline mat around the image, a
 * placard caption beneath. Falls back to the drawn schematic (children) when
 * there is no image or it fails to load.
 */
export function ChartFrame({
  image,
  href,
  caption,
  children,
  className,
}: {
  image: string | null;
  href: string | null;
  caption: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(image) && !failed;
  return (
    <figure className={cn("reveal", className)}>
      <div className="rounded-[2px] border border-line p-[clamp(1rem,3.4vw,2.8rem)]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image!}
            alt="Chart of this trade"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="block h-auto w-full border border-line opacity-0 transition-opacity duration-1000 [.in_&]:opacity-100"
          />
        ) : (
          children
        )}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase">
        <span>{caption}</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="m-link pb-0.5 text-ink-3">
            {showImage ? "Full chart ↗" : "Open chart ↗"}
          </a>
        ) : (
          <span>Schematic · entry → exit</span>
        )}
      </figcaption>
    </figure>
  );
}
