import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, saveNtConnection } from "@/lib/brokers/ntmcp";
import { FLOW_COOKIE, openFlow } from "@/lib/brokers/ntmcp-flow";
import { syncConnection } from "@/lib/brokers/sync";
import { BrokerError } from "@/lib/brokers/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * We arrive here from Tradovate, cross-site, so the strict session cookie
 * isn't sent and a plain redirect would land on the lock screen. Hand back a
 * tiny page that navigates from our own origin instead; the session cookie
 * rides along on that hop.
 */
function finish(path: string) {
  const safe = path.replace(/[^\w/?=&%#.-]/g, "");
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="0;url=${safe}"><title>Connecting</title><body style="background:#0a0a0b;color:#a8a39a;font:11px/1.9 ui-monospace,monospace;letter-spacing:.3em;text-transform:uppercase;display:grid;place-items:center;height:100vh;margin:0"><a href="${safe}" style="color:#ece7dd">Continue &rarr;</a></body>`;
  const res = new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  res.cookies.set(FLOW_COOKIE, "", { path: "/api/tradovate", maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const flow = openFlow(request.cookies.get(FLOW_COOKIE)?.value, q.get("state"));
  if (!flow) return finish("/settings?tradovate=expired#connections");
  if (q.get("error") || !q.get("code")) return finish("/settings?tradovate=cancelled#connections");
  try {
    const tokens = await exchangeCode(flow.env, { clientId: flow.clientId, code: q.get("code")!, verifier: flow.verifier, redirectUri: flow.redirectUri });
    const { id, accounts } = await saveNtConnection(flow.env, flow.clientId, tokens);
    await syncConnection(id, { full: true }).catch(() => null);
    return finish(`/settings?tradovate=connected&n=${accounts}#connections`);
  } catch (err) {
    const msg = err instanceof BrokerError ? err.message : "Tradovate sign-in failed.";
    return finish(`/settings?tradovate=error&msg=${encodeURIComponent(msg)}#connections`);
  }
}
