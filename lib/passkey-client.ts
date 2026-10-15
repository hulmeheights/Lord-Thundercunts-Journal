import { startRegistration } from "@simplewebauthn/browser";

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Mac/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Passkey";
}

/** Registers a Face ID / Touch ID passkey for the signed-in owner. Throws a friendly message on failure. */
export async function registerPasskey(): Promise<void> {
  const opt = await fetch("/api/auth/passkey/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step: "options" }),
  }).then((r) => r.json());
  if (!opt.options) throw new Error(opt.error ?? "Couldn't start passkey setup");
  let response;
  try {
    response = await startRegistration({ optionsJSON: opt.options });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    throw new Error(/NotAllowed|abort|cancel/i.test(msg) ? "Cancelled." : msg || "Passkey setup failed");
  }
  const res = await fetch("/api/auth/passkey/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step: "verify", challengeId: opt.challengeId, response, name: deviceName() }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Couldn't save passkey");
}
