"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Gallery frame for the trade's chart: a hairline mat around the image, a
 * placard caption beneath. Falls back to the drawn schematic (children) when
 * there is no image or it fails to load. The schematic draws itself in once
 * the frame has mounted.
 */
export function ChartFrame({
  image,
  href,
  caption,
  children,
  className,
  style,
}: {
  image: string | null;
  href: string | null;
  caption: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const showImage = Boolean(image) && !failed;
  return (
    <figure className={cn("t-rise", drawn && "t-drawn", className)} style={style}>
      <div className="rounded-[2px] border border-line p-[clamp(1.1rem,3.4vw,2.8rem)]">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image!}
            alt="Chart of this trade"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="block h-auto w-full border border-line opacity-0 transition-opacity delay-300 duration-1000 [.t-drawn_&]:opacity-100"
          />
        ) : (
          children
        )}
      </div>
      <figcaption className="mt-4 flex items-baseline justify-between gap-x-6 font-mono text-[9.5px] tracking-[0.28em] text-ink-4 uppercase">
        <span className="min-w-0">{caption}</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="m-link shrink-0 pb-0.5 text-ink-3">
            {showImage ? "Full chart ↗" : "Open chart ↗"}
          </a>
        ) : (
          <span className="shrink-0">
            Schematic<span className="max-sm:hidden"> · entry → exit</span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
