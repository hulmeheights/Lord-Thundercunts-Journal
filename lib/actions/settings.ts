"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { db } from "../db";
import { encryptJson, sha256 } from "../crypto";
import { getSettings, saveSetting } from "../data/settings";
import { insertTrades } from "../data/trades";
import { insertSampleJournalDays } from "../data/journal";
import { maskHint } from "../data/connections";
import { generateSample } from "../sample";
import { todayKey } from "../analytics/time";
import { testCredentials } from "../brokers/sync";
import { validateProjectXHost, type ProjectXCreds } from "../brokers/projectx";
import type { TradovateCreds } from "../brokers/tradovate";
import { firmById, type PlatformKind } from "../brokers/firms";
import { parseShareInput, type ShareCreds } from "../brokers/topstepshare";
import { BrokerError } from "../brokers/types";
import type { NotifySettings } from "../types";

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

export async function setNotify(v: NotifySettings) {
  await guard();
  const keys: (keyof NotifySettings)[] = ["morning", "checkin", "preSession", "close", "evening", "weekly", "capsules", "goals", "ruleAlerts"];
  await saveSetting("notify", Object.fromEntries(keys.map((k) => [k, v[k] === true])) as NotifySettings);
  revalidatePath("/settings");
  return { ok: true };
}

export async function newWidgetLink() {
  await guard();
  const { createWidgetToken } = await import("../data/widget");
  return { token: await createWidgetToken() };
}

export async function revokeWidgetLink() {
  await guard();
  const { revokeWidgetTokens } = await import("../data/widget");
  await revokeWidgetTokens();
  revalidatePath("/settings");
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

const ProjectX = z.object({
  firm: z.string().trim().min(1).max(40),
  userName: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(8).max(500),
  host: z.string().trim().max(200).optional(),
  label: z.string().trim().max(60).optional(),
});

const Tradovate = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
  cid: z.string().trim().min(1).max(40),
  sec: z.string().trim().min(8).max(200),
  environment: z.enum(["live", "demo"]),
  label: z.string().trim().max(60).optional(),
});

function connSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

async function storeConnection(args: {
  id: string;
  kind: PlatformKind;
  firm: string | null;
  label: string;
  username: string;
  environment: string;
  creds: ProjectXCreds | TradovateCreds | ShareCreds;
}) {
  const { accounts, token } = await testCredentials(args.id, args.kind, args.creds);
  const enc = encryptJson(args.creds, `creds:${args.id}`);
  const sql = await db();
  await sql`
    insert into connections (id, provider, firm, label, username_hint, environment, credentials_enc, status, last_error, last_sync_at, token_enc, token_expires_at)
    values (
      ${args.id}, ${args.kind}, ${args.firm}, ${args.label}, ${args.kind === "share" ? args.username : maskHint(args.username)}, ${args.environment}, ${enc}, 'connected', null, null,
      ${token ? encryptJson(token.token, `token:${args.id}`) : null}, ${token?.expiresAt ?? null}
    )
    on conflict (id) do update set
      provider = excluded.provider, firm = excluded.firm, label = excluded.label, username_hint = excluded.username_hint,
      environment = excluded.environment, credentials_enc = excluded.credentials_enc, status = 'connected', last_error = null,
      last_sync_at = null, token_enc = excluded.token_enc, token_expires_at = excluded.token_expires_at, syncing_at = null, updated_at = now()
  `;
  for (const a of accounts) {
    await sql`
      insert into broker_accounts (id, provider, external_id, name, is_sim, balance, active)
      values (${`${args.id}:${a.externalId}`}, ${args.id}, ${a.externalId}, ${a.name}, ${a.isSim}, ${a.balance}, ${a.active})
      on conflict (id) do update set name = excluded.name, balance = excluded.balance, active = excluded.active, updated_at = now()
    `;
  }
  return accounts.length;
}

export async function connectProjectX(input: z.input<typeof ProjectX>): Promise<{ ok?: boolean; id?: string; accounts?: number; error?: string }> {
  await guard();
  const parsed = ProjectX.safeParse(input);
  if (!parsed.success) return { error: "Enter your platform username and API key." };
  const v = parsed.data;
  const preset = firmById(v.firm);
  if (preset && preset.kind !== "projectx") return { error: "That firm doesn't run on ProjectX." };
  try {
    const host = validateProjectXHost(preset?.host ?? v.host);
    const hostname = new URL(host).hostname;
    // TopstepX keeps the legacy id "topstepx"; every other gateway gets its own connection.
    const id = hostname === "api.topstepx.com" ? "topstepx" : `projectx-${connSlug(preset && preset.id !== "custom" ? preset.id : hostname.replace(/\.projectx\.com$/, "").replace(/^api\.|^gateway-api-?/, ""))}`;
    const label = v.label || (preset && preset.id !== "custom" ? preset.name : hostname.replace(/^api\./, "").replace(/\.projectx\.com$/, ""));
    const accounts = await storeConnection({
      id,
      kind: "projectx",
      firm: preset?.id ?? "custom",
      label,
      username: v.userName,
      environment: "live",
      creds: { userName: v.userName, apiKey: v.apiKey, host },
    });
    revalidatePath("/", "layout");
    return { ok: true, id, accounts };
  } catch (err) {
    return { error: err instanceof BrokerError ? err.message : "Couldn't connect. Check your username, API key and gateway URL." };
  }
}

export async function connectTradovate(input: z.input<typeof Tradovate>): Promise<{ ok?: boolean; id?: string; accounts?: number; error?: string }> {
  await guard();
  const parsed = Tradovate.safeParse(input);
  if (!parsed.success) return { error: "Fill in all Tradovate fields." };
  const v = parsed.data;
  const id = `tradovate-${sha256(v.username.toLowerCase()).slice(0, 8)}`;
  try {
    const accounts = await storeConnection({
      id,
      kind: "tradovate",
      firm: "tradovate",
      label: v.label || "Tradovate",
      username: v.username,
      environment: v.environment,
      creds: { username: v.username, password: v.password, cid: v.cid, sec: v.sec, environment: v.environment },
    });
    revalidatePath("/", "layout");
    return { ok: true, id, accounts };
  } catch (err) {
    return { error: err instanceof BrokerError ? err.message : "Couldn't connect to Tradovate. Check your details." };
  }
}

/** Free TopstepX sync from public share links — no credentials stored at all. */
export async function connectTopstepShare(links: string): Promise<{ ok?: boolean; id?: string; accounts?: number; error?: string }> {
  await guard();
  const ids = parseShareInput(z.string().max(4000).parse(links));
  if (!ids.length) return { error: "Paste at least one TopstepX share link (it contains ?share=<number>)." };
  if (ids.length > 25) return { error: "That's a lot of accounts — paste up to 25 links." };
  try {
    const accounts = await storeConnection({
      id: "topstepx-share",
      kind: "share",
      firm: "topstep-share",
      label: "TopstepX (free)",
      username: `${ids.length} account${ids.length === 1 ? "" : "s"}`,
      environment: "live",
      creds: { accountIds: ids },
    });
    revalidatePath("/", "layout");
    return { ok: true, id: "topstepx-share", accounts };
  } catch (err) {
    return { error: err instanceof BrokerError ? err.message : "Couldn't read those share links. Check sharing is switched on." };
  }
}

/** Disconnecting wipes the stored credentials and tokens. Synced trades and your journal stay. */
export async function disconnectBroker(id: string) {
  await guard();
  const sql = await db();
  await sql`delete from connections where id = ${z.string().min(1).max(80).parse(id)}`;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function renameAccount(id: string, name: string) {
  await guard();
  const sql = await db();
  await sql`update broker_accounts set name = ${z.string().trim().min(1).max(80).parse(name)} where id = ${z.string().max(160).parse(id)}`;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAccountIncluded(id: string, included: boolean) {
  await guard();
  const sql = await db();
  await sql`update broker_accounts set included = ${Boolean(included)} where id = ${z.string().max(160).parse(id)}`;
  revalidatePath("/", "layout");
  return { ok: true };
}

const Plan = z.object({
  monthlyTarget: z.number().min(0).max(10_000_000),
  batch: z.number().int().min(1).max(100),
  overrides: z
    .object({
      passRate: z.number().min(0.01).max(1),
      evalPrice: z.number().min(0).max(100_000),
      avgPayout: z.number().min(1).max(10_000_000),
      payoutsPerFundedMonth: z.number().min(0.01).max(100),
      lossPerFundedMonth: z.number().min(0).max(1),
      daysToPass: z.number().min(0).max(1000),
      daysToPayout: z.number().min(0).max(1000),
    })
    .partial(),
});

/** The Guardian income plan: target, batch size and any rates set by hand. */
export async function savePlan(input: z.input<typeof Plan>) {
  await assertSession();
  await saveSetting("plan", Plan.parse(input));
  revalidatePath("/guardian");
  return { ok: true };
}
