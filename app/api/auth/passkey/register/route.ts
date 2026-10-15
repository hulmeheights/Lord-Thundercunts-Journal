import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { beginRegistration, finishRegistration } from "@/lib/auth/passkeys";

/** Adding a passkey requires an already-unlocked session. */
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    step?: "options" | "verify";
    challengeId?: string;
    response?: unknown;
    name?: string;
  };
  try {
    if (body.step === "options") {
      return NextResponse.json(await beginRegistration());
    }
    if (body.step === "verify" && body.challengeId && body.response) {
      await finishRegistration(body.challengeId, body.response as never, String(body.name ?? "Passkey"));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error && err.message.length < 120 ? err.message : "Could not add the passkey.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
