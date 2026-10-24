import "server-only";
import { createECDH, hkdfSync } from "node:crypto";
import webpush from "web-push";
import { db } from "./db";
import { decryptJson, encryptJson, sha256 } from "./crypto";
import { env } from "./env";

/**
 * Web Push for the home-screen app (iPhone on iOS 16.4+, Android, desktop).
 * The VAPID key pair is derived from ENCRYPTION_KEY, so there's nothing extra
 * to set up and it stays the same across deploys.
 */
const b64url = (b: Buffer) => b.toString("base64url");

let cached: { publicKey: string; privateKey: string } | null = null;
export function vapidKeys(): { publicKey: string; privateKey: string } {
  if (cached) return cached;
  const raw = env.encryptionKey;
  if (raw.length < 32) throw new Error("ENCRYPTION_KEY must be at least 32 characters");
  const priv = Buffer.from(hkdfSync("sha256", raw, "ltj/v1/salt", "ltj/v1/vapid", 32));
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(priv);
  cached = { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(priv) };
  return cached;
}

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

const idFor = (endpoint: string) => `push_${sha256(endpoint).slice(0, 32)}`;

export async function saveSubscription(sub: PushSub, device: string | null): Promise<void> {
  const sql = await db();
  const id = idFor(sub.endpoint);
  await sql`
    insert into push_subscriptions (id, sub_enc, device) values (${id}, ${encryptJson(sub, `push:${id}`)}, ${device})
    on conflict (id) do update set sub_enc = excluded.sub_enc, device = excluded.device
  `;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const sql = await db();
  await sql`delete from push_subscriptions where id = ${idFor(endpoint)}`;
}

export async function subscriptionCount(): Promise<number> {
  const sql = await db();
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from push_subscriptions`;
  return r?.n ?? 0;
}

/** Send to every subscribed device. Dead subscriptions (unsubscribed, app removed) are dropped. */
export async function pushAll(msg: PushMessage): Promise<{ sent: number; failed: number }> {
  const sql = await db();
  const rows = await sql<{ id: string; sub_enc: string }[]>`select id, sub_enc from push_subscriptions`;
  const { publicKey, privateKey } = vapidKeys();
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/", tag: msg.tag ?? "ltj" });
  let sent = 0, failed = 0;
  for (const r of rows) {
    let sub: PushSub;
    try {
      sub = decryptJson<PushSub>(r.sub_enc, `push:${r.id}`);
    } catch {
      await sql`delete from push_subscriptions where id = ${r.id}`;
      continue;
    }
    try {
      await webpush.sendNotification(sub, payload, { vapidDetails: { subject: "mailto:journal@localhost.invalid", publicKey, privateKey }, TTL: 6 * 3600, urgency: "high" });
      sent++;
      await sql`update push_subscriptions set last_sent_at = now() where id = ${r.id}`;
    } catch (err) {
      failed++;
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sql`delete from push_subscriptions where id = ${r.id}`;
    }
  }
  return { sent, failed };
}

/** True the first time a kind of reminder is claimed for a day, false after. */
export async function claimDaily(day: string, kind: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`insert into push_log (day, kind) values (${day}, ${kind}) on conflict do nothing returning day`;
  return rows.length > 0;
}
