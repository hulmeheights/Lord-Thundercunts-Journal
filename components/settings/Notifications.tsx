"use client";

import { useEffect, useState, useTransition } from "react";
import { setNotify } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Note, SRow } from "./ui";

type State = "loading" | "unsupported" | "needs-home-screen" | "denied" | "off" | "on";

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function call(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const res = await fetch("/api/push", { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Something went wrong.");
  return json as Record<string, unknown>;
}

/** Push notifications to this phone or computer: a nudge before the session, and a recap after. */
export function Notifications({ initial, scheduled }: { initial: { preSession: boolean; evening: boolean }; scheduled: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [prefs, setPrefs] = useState(initial);
  const [msg, setMsg] = useState<{ text: string; tone?: "pos" | "warn" } | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !standalone() ? "needs-home-screen" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const turnOn = () =>
    start(async () => {
      setMsg(null);
      try {
        // Ask straight from the tap: iPhone only allows it in direct response to one.
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setState(perm === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const { publicKey } = await call("GET");
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(String(publicKey)) }));
        await call("POST", { subscription: sub.toJSON(), device: isIos() ? "iPhone" : navigator.platform || "This device" });
        setState("on");
        setMsg({ text: "On. Send yourself a test to see one land.", tone: "pos" });
      } catch (e) {
        setMsg({ text: e instanceof Error ? e.message : "Couldn't turn them on.", tone: "warn" });
      }
    });

  const turnOff = () =>
    start(async () => {
      setMsg(null);
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await call("DELETE", { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setState("off");
      } catch (e) {
        setMsg({ text: e instanceof Error ? e.message : "Couldn't turn them off.", tone: "warn" });
      }
    });

  const test = () =>
    start(async () => {
      setMsg(null);
      try {
        const r = await call("POST", { test: true });
        setMsg(Number(r.sent) > 0 ? { text: "Sent. It should land in a few seconds.", tone: "pos" } : { text: `Nothing was delivered${r.reason ? ` (push service said: ${String(r.reason)})` : ""}. Turn them off and on again on this device.`, tone: "warn" });
      } catch (e) {
        setMsg({ text: e instanceof Error ? e.message : "Couldn't send.", tone: "warn" });
      }
    });

  const save = (next: typeof prefs) => {
    setPrefs(next);
    start(async () => {
      await setNotify(next);
    });
  };

  return (
    <div className="max-w-3xl">
      <SRow
        name="This device"
        hint={
          state === "needs-home-screen"
            ? "On iPhone, notifications only work from the home-screen app. Open the journal from its icon on your home screen (not Safari), then come back here."
            : state === "unsupported"
              ? "This browser can't receive push notifications. On iPhone you need iOS 16.4 or later, opened from the home-screen icon."
              : state === "denied"
                ? "Notifications are blocked. On iPhone: Settings → Notifications → Thundercunts → Allow Notifications. Then come back and turn them on."
                : state === "on"
                  ? "Receiving notifications."
                  : "Nothing is sent until you turn it on. Notifications show a short line and open the journal when tapped."
        }
      >
        {state === "on" ? (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={test} disabled={busy}>
              Send a test
            </Button>
            <Button variant="secondary" onClick={turnOff} disabled={busy}>
              Turn off
            </Button>
          </div>
        ) : state === "off" ? (
          <Button onClick={turnOn} disabled={busy}>
            {busy ? "Asking…" : "Turn on notifications"}
          </Button>
        ) : null}
      </SRow>
      <SRow name="Before your session" hint="On trading days, before your window opens: when it opens, your plan, and your clean-day streak.">
        <Toggle checked={prefs.preSession} onChange={(v) => save({ ...prefs, preSession: v })} label="Before your session" />
      </SRow>
      <SRow name="Evening recap" hint="After the close: how the day counted for the mission, and a nudge if the journal is still empty.">
        <Toggle checked={prefs.evening} onChange={(v) => save({ ...prefs, evening: v })} label="Evening recap" />
      </SRow>
      {!scheduled && <Note className="mt-6">The test works now. The daily reminders need CRON_SECRET set in Vercel (the same one that runs the nightly sync).</Note>}
      {msg && (
        <Note className="mt-6" tone={msg.tone}>
          {msg.text}
        </Note>
      )}
    </div>
  );
}
