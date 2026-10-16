import { NextResponse, type NextRequest } from "next/server";
import { assertSession } from "@/lib/auth/session";
import { randomToken } from "@/lib/crypto";
import { authorizeUrl, pkcePair, registerClient } from "@/lib/brokers/ntmcp";
import { FLOW_COOKIE, FLOW_TTL_S, sealFlow } from "@/lib/brokers/ntmcp-flow";
import { BrokerError } from "@/lib/brokers/types";

export const dynamic = "force-dynamic";

/** Step 1 of "Log in with Tradovate": register this app, then send you to Tradovate's own sign-in page. */
export async function GET(request: NextRequest) {
  try {
    await assertSession();
  } catch {
    return NextResponse.redirect(new URL("/unlock", request.url));
  }
  const env = request.nextUrl.searchParams.get("env") === "live" ? "live" : "demo";
  const redirectUri = new URL("/api/tradovate/callback", request.nextUrl.origin).toString();
  try {
    const clientId = await registerClient(env, redirectUri);
    const { verifier, challenge } = pkcePair();
    const state = randomToken(24);
    const res = NextResponse.redirect(authorizeUrl({ env, clientId, redirectUri, challenge, state }));
    res.cookies.set(FLOW_COOKIE, sealFlow({ state, verifier, clientId, env, redirectUri, exp: Date.now() + FLOW_TTL_S * 1000 }), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      // Lax so it comes back with Tradovate's top-level redirect to the callback.
      sameSite: "lax",
      path: "/api/tradovate",
      maxAge: FLOW_TTL_S,
    });
    return res;
  } catch (err) {
    const msg = err instanceof BrokerError ? err.message : "Couldn't start the Tradovate sign-in.";
    return NextResponse.redirect(new URL(`/settings?tradovate=error&msg=${encodeURIComponent(msg)}#connections`, request.url));
  }
}
