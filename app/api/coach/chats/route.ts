import { after, NextResponse } from "next/server";
import { assertSession } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/env";
import { chatsNeedingNotes, listChats, setNote } from "@/lib/data/coach";
import { aiCoachNote } from "@/lib/ai/coachNote";

export const maxDuration = 120;

/** Past conversations with their notes. Also catches up any chat whose last exchange wasn't noted yet. */
export async function GET() {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (aiConfigured()) {
    after(async () => {
      try {
        for (const c of await chatsNeedingNotes(3)) {
          const draft = await aiCoachNote(c.messages);
          if (draft) await setNote(c.id, { ...draft, count: c.messages.length });
        }
      } catch {
        /* retried on the next visit */
      }
    });
  }
  return NextResponse.json({ chats: await listChats() });
}
