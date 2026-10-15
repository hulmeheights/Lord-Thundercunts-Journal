import { NextResponse } from "next/server";
import { assertSameOrigin, clientIpHash, createSession } from "@/lib/auth/session";
import { beginLogin, finishLogin } from "@/lib/auth/passkeys";
import { checkUnlockRateLimit, recordAttempt } from "@/lib/auth/ratelimit";
import { isConfigured } from "@/lib/env";

export async function POST(request: Request) {
  if (!isConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  try {
    await assertSameOrigin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { step?: "options" | "verify"; challengeId?: string; response?: unknown };
  const ipHash = await clientIpHash();

  if (body.step === "options") {
    try {
      return NextResponse.json(await beginLogin());
    } catch {
      return NextResponse.json({ error: "Too many pending sign-in attempts. Try again shortly." }, { status: 429 });
    }
  }

  if (body.step === "verify" && body.challengeId && body.response) {
    const limit = await checkUnlockRateLimit(ipHash);
    // Passkeys can't be brute-forced, but keep per-network throttling anyway.
    if (!limit.ok && limit.reason.startsWith("Too many")) return NextResponse.json({ error: limit.reason }, { status: 429 });
    let ok = false;
    try {
      ok = await finishLogin(body.challengeId, body.response as never);
    } catch {
      ok = false;
    }
    await recordAttempt(ipHash, ok);
    if (!ok) return NextResponse.json({ error: "That passkey wasn't recognised." }, { status: 401 });
    await createSession("passkey");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
