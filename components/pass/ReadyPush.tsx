"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPassReadyPush } from "@/lib/actions/pass";
import { Toggle } from "@/components/ui/Toggle";

/** One "ready for the session" note on your phone when the main script's heartbeat arrives. */
export function ReadyPush({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <label className="flex items-start gap-3 font-mono text-[10.5px] leading-[1.7] text-ink-2">
      <span className="mt-0.5">
        <Toggle
          checked={on}
          label="Ready push before each session"
          onChange={(v) => {
            setOn(v);
            start(async () => {
              await setPassReadyPush(v);
              router.refresh();
            });
          }}
        />
      </span>
      <span>
        Push me a &quot;ready&quot; note ten minutes before each session
        <span className="block text-[9.5px] text-ink-4">The alert, your Mac, and what each account would do. A missed heartbeat always reaches your phone, whatever this is set to.</span>
      </span>
    </label>
  );
}
