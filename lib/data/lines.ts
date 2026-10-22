import "server-only";
import { after } from "next/server";
import { db } from "../db";
import { sha256 } from "../crypto";
import { aiConfigured } from "../env";
import { aiPersonalLine, type PersonalLine } from "../ai/line";
import { getSettings } from "./settings";

type Page = "insights" | "guardian";
type Row = { hash: string; line: string; cite: string; created_at: Date };

/** Don't rewrite a page's line more than this often while an import is still landing. */
const COOLDOWN_MS = 10 * 60_000;

/**
 * A page's personal closing line. The facts are fingerprinted: while they
 * match, the saved AI line is shown; when trades, the journal or the ledger
 * change, the page shows the plain line worked out from the numbers and a new
 * AI line is written in the background for the next visit. So it follows your
 * data and only costs anything when something has actually changed.
 */
export async function personalLine(page: Page, facts: Record<string, unknown>, fallback: PersonalLine): Promise<PersonalLine> {
  const hash = sha256(JSON.stringify(facts));
  const sql = await db();
  const [row] = await sql<Row[]>`select hash, line, cite, created_at from personal_lines where page = ${page}`;
  if (row && row.hash === hash) return { line: row.line, cite: row.cite };

  const settings = await getSettings();
  const due = !row || Date.now() - row.created_at.getTime() > COOLDOWN_MS;
  if (aiConfigured() && settings.ai.enabled && due) {
    after(async () => {
      try {
        const fresh = await aiPersonalLine(page, facts);
        if (!fresh) return;
        const s = await db();
        await s`
          insert into personal_lines (page, hash, line, cite) values (${page}, ${hash}, ${fresh.line}, ${fresh.cite})
          on conflict (page) do update set hash = excluded.hash, line = excluded.line, cite = excluded.cite, created_at = now()
        `;
      } catch {
        // No line this time; the plain one stands and the next change tries again.
      }
    });
  }
  return fallback;
}
