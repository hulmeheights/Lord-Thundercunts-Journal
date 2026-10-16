import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { exchangeCode, saveNtConnection } from "@/lib/brokers/ntmcp";
import { FLOW_COOKIE, openFlow } from "@/lib/brokers/ntmcp-flow";
import { readPastedCallback } from "@/lib/brokers/ntmcp-parse";
import { syncConnection } from "@/lib/brokers/sync";
import { BrokerError } from "@/lib/brokers/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Step 2 of "Log in with Tradovate": you paste the address Tradovate sent you
 * to. We check it belongs to the sign-in this browser started (sealed cookie +
 * state), swap the code for tokens with the PKCE verifier, save the connection
 * and pull the first year of fills.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { pasted?: unknown };
  const pasted = readPastedCallback(typeof body.pasted === "string" ? body.pasted : "");
  if (!pasted) return NextResponse.json({ error: "That doesn't look like the address from Tradovate. Copy the whole address bar of the page that didn't load." }, { status: 400 });
  if (pasted.error) {
    const why = (pasted.reason ?? "").replace(/[^\w .,'()-]/g, "").slice(0, 200);
    const msg =
      pasted.error === "access_denied"
        ? `Tradovate refused the sign-in${why ? ` ("${why}")` : ""}. If you pressed Allow, your firm may not let this app connect: try "Use NinjaTrader's sign-in page" below.`
        : `Tradovate answered "${pasted.error}"${why ? `: ${why}` : ""}. Start again.`;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sealed = request.cookies.get(FLOW_COOKIE)?.value;
  const flow = openFlow(sealed, pasted.state);
  if (!flow) return NextResponse.json({ error: "That sign-in has expired (10 minutes) or was started in another browser. Press Log in with Tradovate again." }, { status: 400 });

  try {
    const tokens = await exchangeCode(flow.env, { clientId: flow.clientId, code: pasted.code, verifier: flow.verifier, redirectUri: flow.redirectUri });
    const { id, accounts } = await saveNtConnection(flow.env, flow.clientId, tokens);
    const sync = await syncConnection(id, { full: true }).catch(() => null);
    const res = NextResponse.json({ ok: true, accounts, trades: sync?.trades ?? null, syncError: sync && !sync.ok ? sync.error : null });
    res.cookies.set(FLOW_COOKIE, "", { path: "/api/tradovate", maxAge: 0 });
    return res;
  } catch (err) {
    const msg = err instanceof BrokerError ? err.message : "Tradovate sign-in failed. Press Log in with Tradovate and try again.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

