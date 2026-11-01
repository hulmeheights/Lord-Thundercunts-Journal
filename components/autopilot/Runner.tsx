"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { newRunnerKey } from "@/lib/actions/bot";
import { Button } from "@/components/ui/Button";
import { Copy } from "./Copy";

/** The runner on your Mac: is it connected, a key for it, and the three commands that set it up. */
export function Runner({ status, origin, lastSeen }: { status: { paired: boolean; online: boolean; info: string | null }; origin: string; lastSeen: string | null }) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[12px]">
        <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${status.online ? "bg-pos shadow-[0_0_8px_2px_rgba(116,184,156,0.7)]" : status.paired ? "bg-neg" : "bg-ink-4"}`} />
        <span className={status.online ? "text-pos" : status.paired ? "text-neg" : "text-ink-3"}>
          {status.online ? "Your Mac is connected" : status.paired ? "Your Mac isn't connected" : "No Mac set up yet"}
        </span>
        {status.info && <span className="text-ink-4">· {status.info}</span>}
        {lastSeen && <span className="text-ink-4">· last seen {lastSeen}</span>}
      </div>
      <p className="mt-3 font-mono text-[10.5px] leading-[1.8] text-ink-4">
        Outside the sessions your Mac checks in every few minutes, so &quot;not connected&quot; between sessions can be normal. During a session it should stay green. If it isn&apos;t
        connected when a live signal comes, nothing is placed and the log says so.
      </p>

      <ol className="mt-6 list-decimal space-y-4 pl-5 font-mono text-[11px] leading-[1.8] text-ink-2 marker:text-ink-4">
        <li>
          Make a key for your Mac:{" "}
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErr(null);
                const r = await newRunnerKey();
                if (r.error) return setErr(r.error);
                setKey(r.key ?? null);
                router.refresh();
              })
            }
          >
            {status.paired ? "Make a new key" : "Make a key"}
          </Button>
          {key && (
            <div className="mt-3 border border-gold/50 p-3">
              <Copy label="Your runner key: copy it now, it's only shown once" value={key} />
            </div>
          )}
          {err && <p className="mt-2 text-neg">{err}</p>}
        </li>
        <li>
          On your Mac, open <b className="text-ink">Terminal</b> (Spotlight → Terminal) and paste these one at a time:
          <Copy label="1 · download the runner" value={`curl -fsSL -o ~/autopilot-runner.py ${origin}/autopilot-runner.py`} />
          <Copy label="2 · set it up (asks for the key, your TopstepX username and API key)" value="python3 ~/autopilot-runner.py setup" />
          <Copy label="3 · start it, now and every time you log in" value="python3 ~/autopilot-runner.py install" />
        </li>
        <li>Come back here: within a minute of a session it shows a green &quot;connected&quot; light.</li>
      </ol>
      <p className="mt-6 font-mono text-[10.5px] leading-[1.8] text-ink-4">
        Keep the Mac plugged in, logged in and online during the sessions you trade (overnight too, if London or Asia are on). With the lid closed a MacBook sleeps unless it&apos;s
        connected to a screen, so leave it open. Your TopstepX API key is saved only on your Mac. Stop it any time with <code>python3 ~/autopilot-runner.py uninstall</code>.
      </p>
    </div>
  );
}
