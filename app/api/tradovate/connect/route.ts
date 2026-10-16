import { NextResponse, type NextRequest } from "next/server";
import { assertSession } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto";
import { authorizeUrl, pkcePair, registerClient } from "@/lib/brokers/ntmcp";
import { FLOW_COOKIE, FLOW_TTL_S, sealFlow } from "@/lib/brokers/ntmcp-flow";
import { LOOPBACK_REDIRECT } from "@/lib/brokers/ntmcp-parse";
import { BrokerError } from "@/lib/brokers/types";

export const dynamic = "force-dynamic";

/**
 * Step 1 of "Log in with Tradovate": register, then send you to Tradovate's own
 * sign-in. Tradovate only allows this sign-in to return to a loopback address,
 * so the code comes back in the address bar and you paste it into Settings
 * (step 2, /api/tradovate/finish). Opened in a new tab; the sealed flow cookie
 * is shared with the Settings tab.
 */
export async function GET(request: NextRequest) {
  try {
    await assertSession();
  } catch {
    return NextResponse.redirect(new URL("/unlock", request.url));
  }
  const env = request.nextUrl.searchParams.get("env") === "live" ? "live" : "demo";
  // Two front doors to the same sign-in: Tradovate's own page (default) or NinjaTrader's.
  const via = request.nextUrl.searchParams.get("via") === "nt" ? "nt" : "tv";
  const redirectUri = LOOPBACK_REDIRECT;
  try {
    const clientId = await registerClient(env, redirectUri);
    const { verifier, challenge } = pkcePair();
    const state = randomToken(24);
    const res = NextResponse.redirect(authorizeUrl({ env, clientId, redirectUri, challenge, state, via }));
    res.cookies.set(FLOW_COOKIE, sealFlow({ state, verifier, clientId, env, redirectUri, exp: Date.now() + FLOW_TTL_S * 1000 }), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "strict",
      path: "/api/tradovate",
      maxAge: FLOW_TTL_S,
    });
    return res;
  } catch (err) {
    const msg = err instanceof BrokerError ? err.message : "Couldn't start the Tradovate sign-in.";
    return NextResponse.redirect(new URL(`/settings?tradovate=error&msg=${encodeURIComponent(msg)}#connections`, request.url));
  }
}
