"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { randomToken } from "../crypto";
import { OBSTACLE_KEYS, perceptionGap, type ObstacleKey } from "../analytics/observer";
import { getSettings, saveSetting } from "../data/settings";
import { deleteObserverSession, insertObserverSession, loadDossier, markAdopted, OBSERVER_WINDOWS, type ObserverWindow } from "../data/observer";
import type { TradingRules } from "../types";

const text = z.string().trim().max(2000).nullable().transform((v) => (v && v.length ? v : null));
const Win = z.union([z.literal(OBSERVER_WINDOWS[0]), z.literal(OBSERVER_WINDOWS[1])]);
const Key = z.enum(OBSTACLE_KEYS as [ObstacleKey, ...ObstacleKey[]]);

const Session = z.object({
  window: Win,
  wants: text,
  doing: text,
  stopping: text,
  advice: text,
  believed: z.array(Key).max(OBSTACLE_KEYS.length),
});

/** Saves a third-person review, with the evidence as it stands right now. */
export async function saveObserverSession(input: z.input<typeof Session>) {
  await assertSession();
  const parsed = Session.safeParse(input);
  if (!parsed.success) return { error: "Something in that entry was too long." };
  const v = parsed.data;
  if (!v.wants && !v.doing && !v.stopping && !v.advice && !v.believed.length) return { error: "Write at least one answer first." };
  const { dossier, today } = await loadDossier(v.window, v.wants);
  const gap = perceptionGap([...new Set(v.believed)], dossier);
  const id = randomToken(12);
  await insertObserverSession({
    id,
    day: today,
    from: dossier.from,
    to: dossier.to,
    wants: v.wants,
    doing: v.doing,
    stopping: v.stopping,
    advice: v.advice,
    believed: [...new Set(v.believed)],
    snapshot: {
      headline: dossier.headline,
      sample: { trades: dossier.sample.trades, days: dossier.sample.days },
      top: dossier.stopping.slice(0, 5).map((o) => ({ key: o.key, title: o.title, cost: Math.round(o.cost) })),
    },
    gap: { verdict: gap.verdict, message: gap.message },
  });
  revalidatePath("/observer");
  return { ok: true, id, gap: { verdict: gap.verdict, message: gap.message } };
}

/** Merges a patch so a rule can only get stricter, never looser. */
function tighten(rules: TradingRules, patch: Partial<TradingRules>): { rules: TradingRules; changed: string[] } {
  const next = { ...rules };
  const changed: string[] = [];
  if (patch.maxTradesPerDay != null && (next.maxTradesPerDay == null || patch.maxTradesPerDay < next.maxTradesPerDay)) {
    next.maxTradesPerDay = patch.maxTradesPerDay;
    changed.push(`Max ${patch.maxTradesPerDay} trades a day`);
  }
  if (patch.maxContracts != null && (next.maxContracts == null || patch.maxContracts < next.maxContracts)) {
    next.maxContracts = patch.maxContracts;
    changed.push(`Max ${patch.maxContracts} contracts`);
  }
  if (patch.cooldownMinutesAfterLoss != null && (next.cooldownMinutesAfterLoss == null || patch.cooldownMinutesAfterLoss > next.cooldownMinutesAfterLoss)) {
    next.cooldownMinutesAfterLoss = patch.cooldownMinutesAfterLoss;
    changed.push(`${patch.cooldownMinutesAfterLoss}-minute cool-down after a loss`);
  }
  if (patch.stopAfterConsecutiveLosses != null && (next.stopAfterConsecutiveLosses == null || patch.stopAfterConsecutiveLosses < next.stopAfterConsecutiveLosses)) {
    next.stopAfterConsecutiveLosses = patch.stopAfterConsecutiveLosses;
    changed.push(`Stop after ${patch.stopAfterConsecutiveLosses} losses in a row`);
  }
  return { rules: next, changed };
}

/**
 * "Tell them" → make it real: tightens the auto-enforced rules and/or adds the
 * instruction to the daily checklist, so the Discipline ring holds them to it.
 */
export async function adoptInstruction(input: { sessionId?: string | null; obstacle: ObstacleKey; window: ObserverWindow }) {
  await assertSession();
  const parsed = z.object({ sessionId: z.string().max(40).nullish(), obstacle: Key, window: Win }).safeParse(input);
  if (!parsed.success) return { error: "Unknown instruction." };
  const { sessionId, obstacle, window } = parsed.data;
  const { settings, dossier } = await loadDossier(window);
  const found = dossier.stopping.find((o) => o.key === obstacle);
  if (!found) return { error: "That pattern no longer shows up in your data." };
  const ins = found.instruction;
  const applied: string[] = [];

  if (ins.rulesPatch) {
    const { rules, changed } = tighten(settings.rules, ins.rulesPatch);
    if (changed.length) {
      await saveSetting("rules", rules);
      applied.push(...changed.map((c) => `Rule: ${c}`));
    }
  }
  if (ins.checklist) {
    const label = ins.checklist.slice(0, 160);
    const exists = settings.ritual.some((i) => i.label.toLowerCase() === label.toLowerCase());
    if (!exists && settings.ritual.length < 40) {
      await saveSetting("ritual", [...settings.ritual, { id: `obs-${obstacle}`.slice(0, 40), label, group: "post" }]);
      applied.push(`Checklist: ${label}`);
    }
  }
  if (sessionId) await markAdopted(sessionId, obstacle);
  revalidatePath("/", "layout");
  return { ok: true, applied: applied.length ? applied : ["Already part of your rules and checklist."] };
}

export async function removeObserverSession(id: string) {
  await assertSession();
  await deleteObserverSession(z.string().min(1).max(40).parse(id));
  revalidatePath("/observer");
  return { ok: true };
}

const Prefs = z.object({
  name: z.string().trim().max(40).nullable().transform((v) => (v ? v : null)),
  pronoun: z.enum(["they", "he", "she"]),
});

export async function saveObserverPrefs(input: z.input<typeof Prefs>) {
  await assertSession();
  const parsed = Prefs.safeParse(input);
  if (!parsed.success) return { error: "Keep the name under 40 characters." };
  const { observer } = await getSettings();
  // Merge, so a pinned order survives a change of name or pronoun.
  await saveSetting("observer", { ...observer, ...parsed.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Pins one instruction as the standing order. From then on the Observer checks
 * every session against it, automatically, from the trades themselves.
 */
export async function pinOrder(input: { obstacle: ObstacleKey; window: ObserverWindow }) {
  await assertSession();
  const parsed = z.object({ obstacle: Key, window: Win }).safeParse(input);
  if (!parsed.success) return { error: "Unknown instruction." };
  const { settings, dossier, today } = await loadDossier(parsed.data.window);
  const found = dossier.stopping.find((o) => o.key === parsed.data.obstacle);
  if (!found) return { error: "That pattern no longer shows up in your data." };
  await saveSetting("observer", { ...settings.observer, pinned: found.key, pinnedAt: today, pinnedParams: found.instruction.params });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unpinOrder() {
  await assertSession();
  const { observer } = await getSettings();
  await saveSetting("observer", { ...observer, pinned: null, pinnedAt: null, pinnedParams: null });
  revalidatePath("/", "layout");
  return { ok: true };
}
