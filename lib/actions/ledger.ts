"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSession } from "../auth/session";
import { LEDGER_KINDS, isInflow, isOutcome } from "../analytics/ledger";
import { deleteLedgerEntry as removeEntry, insertLedgerEntry } from "../data/ledger";

/** A real calendar day, not just the right shape (rejects 2026-02-31). */
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d && d >= "2000-01-01" && d <= "2100-12-31";
  }, "Not a real date");

/** Collapse whitespace and strip control characters from free text. */
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

const Entry = z
  .object({
  day: Day,
  firm: z.string().transform(clean).pipe(z.string().min(1, "Which firm?").max(60)),
  account: z
    .string()
    .nullish()
    .transform((s) => (s ? clean(s) : ""))
    .pipe(z.string().max(80))
    .transform((s) => s || null),
  kind: z.enum(LEDGER_KINDS),
  amount: z
    .number()
    .finite()
    .min(0)
    .max(1_000_000)
    .transform((n) => Math.round(n * 100) / 100),
  qty: z.number().int("A whole number of accounts").min(1).max(100).default(1),
  note: z
    .string()
    .nullish()
    .transform((s) => (s ? clean(s) : ""))
    .pipe(z.string().max(280))
    .transform((s) => s || null),
  })
  // Account results carry a count, never money; everything else needs an amount.
  .transform((v) => (isOutcome(v.kind) ? { ...v, amount: 0 } : v))
  // Costs can be free ($0 activation, a promo eval); money coming in can't be nothing.
  .refine((v) => isOutcome(v.kind) || !isInflow(v.kind) || v.amount > 0, { message: "Amount must be more than zero", path: ["amount"] });

export type LedgerInput = z.input<typeof Entry>;
export type LedgerResult = { ok: true; id: string } | { ok: false; error: string };

export async function addLedgerEntry(input: LedgerInput): Promise<LedgerResult> {
  await assertSession();
  const parsed = Entry.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the entry and try again." };
  }
  const saved = await insertLedgerEntry(parsed.data);
  revalidatePath("/guardian");
  return { ok: true, id: saved.id };
}

export async function deleteLedgerEntry(id: string): Promise<{ ok: boolean }> {
  await assertSession();
  const safe = z.string().regex(/^led_[A-Za-z0-9_-]{1,40}$/).parse(id);
  const ok = await removeEntry(safe);
  revalidatePath("/guardian");
  return { ok };
}
