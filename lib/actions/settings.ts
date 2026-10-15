"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { db } from "../db";
import { encryptJson } from "../crypto";
import { getSettings, saveSetting } from "../data/settings";
import { insertTrades } from "../data/trades";
import { insertSampleJournalDays } from "../data/journal";
import { maskHint } from "../data/connections";
import { generateSample } from "../sample";
import { todayKey } from "../analytics/time";
import { testCredentials } from "../brokers/sync";
import { validateProjectXHost } from "../brokers/projectx";
import { BrokerError } from "../brokers/types";

const num = (max: number) => z.number().min(0).max(max).nullable();
const hhmm = z.string().regex(/^\d{2}:\d{2}$/).nullable();

const Rules = z.object({
  maxTradesPerDay: num(200),
  maxDailyLoss: num(10_000_000),
  stopAfterConsecutiveLosses: num(50),
  maxContracts: num(10_000),
  maxLossPerTrade: num(10_000_000),
  cooldownMinutesAfterLoss: num(600),
  sessionStart: hhmm,
  sessionEnd: hhmm,
  defaultRisk: num(10_000_000),
  custom: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(160) })).max(20),
});

const Prop = z.object({
  enabled: z.boolean(),
  firm: z.string().max(60),
  preset: z.enum(["50K", "100K", "150K", "custom"]),
  phase: z.enum(["combine", "funded"]),
  startBalance: z.number().positive().max(100_000_000),
  profitTarget: num(100_000_000),
  maxLossLimit: z.number().positive().max(100_000_000),
  dailyLossLimit: num(100_000_000),
  consistencyPct: num(100),
  maxContracts: num(10_000),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountIds: z.array(z.string().max(120)).max(100),
});

const Ritual = z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(160), group: z.enum(["pre", "post", "life"]) })).max(40);
const Vocab = z.object({
  setups: z.array(z.string().min(1).max(60)).max(60),
  mistakes: z.array(z.string().min(1).max(60)).max(60),
  emotions: z.array(z.string().min(1).max(40)).max(40),
});
const Profile = z.object({
  name: z.string().min(1).max(60),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
});

async function guard() {
  await assertSession();
}

export async function saveRules(v: z.input<typeof Rules>) {
  await guard();
  await saveSetting("rules", Rules.parse(v));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveProp(v: z.input<typeof Prop>) {
  await guard();
  await saveSetting("prop", Prop.parse(v));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveRitual(v: z.input<typeof Ritual>) {
  await guard();
  await saveSetting("ritual", Ritual.parse(v));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveVocab(v: z.input<typeof Vocab>) {
  await guard();
  await saveSetting("vocab", Vocab.parse(v));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveProfile(v: z.input<typeof Profile>) {
  await guard();
  const parsed = Profile.safeParse(v);
  if (!parsed.success) return { error: "Unknown timezone" };
  await saveSetting("profile", parsed.data);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAiEnabled(enabled: boolean) {
  await guard();
  await saveSetting("ai", { enabled: Boolean(enabled) });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Data ────────────────────────────────────────────────────────────────────

export async function loadSampleData() {
  await guard();
  const settings = await getSettings();
  const { trades, journals } = generateSample(todayKey(settings.profile.timezone), settings);
  await insertTrades(trades);
  await insertSampleJournalDays(journals);
  revalidatePath("/", "layout");
  return { ok: true, trades: trades.length };
}

export async function clearSampleData() {
  await guard();
  const sql = await db();
  await sql`delete from trades where source = 'sample'`;
  await sql`delete from journal_days where is_sample`;
  await sql`delete from briefings`;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAllTradingData(confirm: string) {
  await guard();
  if (confirm !== "DELETE") return { error: "Type DELETE to confirm." };
  const sql = await db();
  await sql`delete from trades`;
  await sql`delete from fills`;
  await sql`delete from briefings`;
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Broker connections ─────────────────────────────────────────────────────

const TopstepX = z.object({
  userName: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(8).max(500),
  host: z.string().trim().max(200).optional(),
});

const Tradovate = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
  cid: z.string().trim().min(1).max(40),
  sec: z.string().trim().min(8).max(200),
  environment: z.enum(["live", "demo"]),
});

async function storeConnection(
  provider: "topstepx" | "tradovate",
  label: string,
  username: string,
  environment: string,
  creds: unknown,
) {
  const enc = encryptJson(creds, `creds:${provider}`);
  const { accounts, token } = await testCredentials(provider, enc);
  const sql = await db();
  await sql`
    insert into connections (provider, label, username_hint, environment, credentials_enc, status, last_error, last_sync_at, token_enc, token_expires_at)
    values (
      ${provider}, ${label}, ${maskHint(username)}, ${environment}, ${enc}, 'connected', null, null,
      ${token ? encryptJson(token.token, `token:${provider}`) : null}, ${token?.expiresAt ?? null}
    )
    on conflict (provider) do update set
      label = excluded.label, username_hint = excluded.username_hint, environment = excluded.environment,
      credentials_enc = excluded.credentials_enc, status = 'connected', last_error = null, last_sync_at = null,
      token_enc = excluded.token_enc, token_expires_at = excluded.token_expires_at, syncing_at = null, updated_at = now()
  `;
  for (const a of accounts) {
    await sql`
      insert into broker_accounts (id, provider, external_id, name, is_sim, balance, active)
      values (${`${provider}:${a.externalId}`}, ${provider}, ${a.externalId}, ${a.name}, ${a.isSim}, ${a.balance}, ${a.active})
      on conflict (id) do update set name = excluded.name, balance = excluded.balance, active = excluded.active, updated_at = now()
    `;
  }
  return accounts.length;
}

export async function connectTopstepX(input: z.input<typeof TopstepX>): Promise<{ ok?: boolean; accounts?: number; error?: string }> {
  await guard();
  const parsed = TopstepX.safeParse(input);
  if (!parsed.success) return { error: "Enter your TopstepX username and API key." };
  try {
    const host = validateProjectXHost(parsed.data.host || undefined);
    const accounts = await storeConnection("topstepx", "TopstepX", parsed.data.userName, "live", {
      userName: parsed.data.userName,
      apiKey: parsed.data.apiKey,
      host,
    });
    revalidatePath("/", "layout");
    return { ok: true, accounts };
  } catch (err) {
    return { error: err instanceof BrokerError ? err.message : "Couldn't connect to TopstepX. Check your details." };
  }
}

export async function connectTradovate(input: z.input<typeof Tradovate>): Promise<{ ok?: boolean; accounts?: number; error?: string }> {
  await guard();
  const parsed = Tradovate.safeParse(input);
  if (!parsed.success) return { error: "Fill in all Tradovate fields." };
  try {
    const accounts = await storeConnection("tradovate", "Tradovate", parsed.data.username, parsed.data.environment, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, accounts };
  } catch (err) {
    return { error: err instanceof BrokerError ? err.message : "Couldn't connect to Tradovate. Check your details." };
  }
}

/** Disconnecting wipes the stored credentials and tokens. Synced trades and your journal stay. */
export async function disconnectBroker(provider: string) {
  await guard();
  const p = z.enum(["topstepx", "tradovate"]).parse(provider);
  const sql = await db();
  await sql`delete from connections where provider = ${p}`;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAccountIncluded(id: string, included: boolean) {
  await guard();
  const sql = await db();
  await sql`update broker_accounts set included = ${Boolean(included)} where id = ${z.string().max(120).parse(id)}`;
  revalidatePath("/", "layout");
  return { ok: true };
}
