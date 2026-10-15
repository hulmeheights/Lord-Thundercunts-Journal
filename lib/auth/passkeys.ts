import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "../db";
import { randomToken } from "../crypto";
import { requestOrigin } from "./session";

const RP_NAME = "Lord Thundercunts Journal";
const OWNER_USER_ID = new TextEncoder().encode("ltj-owner");

type PasskeyRow = { id: string; public_key: string; counter: number; transports: string[]; name: string };

async function storeChallenge(challenge: string, purpose: "register" | "login"): Promise<string> {
  const sql = await db();
  const id = randomToken(18);
  await sql`delete from webauthn_challenges where expires_at < now()`;
  // The login-options endpoint is public; cap outstanding challenges so it can't be used to bloat the database.
  const [open] = await sql<{ n: number }[]>`select count(*)::int as n from webauthn_challenges`;
  if ((open?.n ?? 0) >= 200) throw new Error("Too many pending sign-in attempts. Try again in a few minutes.");
  await sql`
    insert into webauthn_challenges (id, challenge, purpose, expires_at)
    values (${id}, ${challenge}, ${purpose}, now() + interval '5 minutes')
  `;
  return id;
}

/** Challenges are single-use: fetched and deleted atomically. */
async function consumeChallenge(id: string, purpose: "register" | "login"): Promise<string | null> {
  if (typeof id !== "string" || id.length > 64) return null;
  const sql = await db();
  const rows = await sql<{ challenge: string }[]>`
    delete from webauthn_challenges
    where id = ${id} and purpose = ${purpose} and expires_at > now()
    returning challenge
  `;
  return rows[0]?.challenge ?? null;
}

export async function passkeyCount(): Promise<number> {
  const sql = await db();
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from passkeys`;
  return row?.n ?? 0;
}

export async function listPasskeys() {
  const sql = await db();
  const rows = await sql<{ id: string; name: string; created_at: Date; last_used_at: Date | null }[]>`
    select id, name, created_at, last_used_at from passkeys order by created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at.toISOString(),
    lastUsedAt: r.last_used_at?.toISOString() ?? null,
  }));
}

export async function deletePasskey(id: string) {
  const sql = await db();
  await sql`delete from passkeys where id = ${id}`;
}

export async function beginRegistration() {
  const sql = await db();
  const { rpID } = await requestOrigin();
  const existing = await sql<PasskeyRow[]>`select id, transports from passkeys`;
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: "owner",
    userDisplayName: "Lord Thundercunt",
    userID: OWNER_USER_ID,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = await storeChallenge(options.challenge, "register");
  return { challengeId, options };
}

export async function finishRegistration(challengeId: string, response: RegistrationResponseJSON, name: string) {
  const expectedChallenge = await consumeChallenge(challengeId, "register");
  if (!expectedChallenge) throw new Error("Registration expired. Try again.");
  const { origin, rpID } = await requestOrigin();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("Passkey could not be verified");
  const { credential } = verification.registrationInfo;
  const sql = await db();
  const label = (name || "Passkey").slice(0, 60);
  await sql`
    insert into passkeys (id, public_key, counter, transports, name)
    values (
      ${credential.id},
      ${Buffer.from(credential.publicKey).toString("base64url")},
      ${credential.counter},
      ${credential.transports ?? []},
      ${label}
    )
  `;
}

export async function beginLogin() {
  const { rpID } = await requestOrigin();
  // Discoverable credentials: the browser offers the owner's passkey without
  // us revealing which credential IDs exist.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const challengeId = await storeChallenge(options.challenge, "login");
  return { challengeId, options };
}

export async function finishLogin(challengeId: string, response: AuthenticationResponseJSON): Promise<boolean> {
  const expectedChallenge = await consumeChallenge(challengeId, "login");
  if (!expectedChallenge) return false;
  const sql = await db();
  const rows = await sql<PasskeyRow[]>`
    select id, public_key, counter, transports, name from passkeys where id = ${String(response.id)}
  `;
  const pk = rows[0];
  if (!pk) return false;
  const { origin, rpID } = await requestOrigin();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: pk.id,
      publicKey: new Uint8Array(Buffer.from(pk.public_key, "base64url")),
      counter: Number(pk.counter),
      transports: pk.transports,
    },
  });
  if (!verification.verified) return false;
  await sql`
    update passkeys set counter = ${verification.authenticationInfo.newCounter}, last_used_at = now()
    where id = ${pk.id}
  `;
  return true;
}
