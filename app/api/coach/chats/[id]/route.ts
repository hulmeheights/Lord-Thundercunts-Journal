import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { deleteChat, getChat, isChatId } from "@/lib/data/coach";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const chat = isChatId(id) ? await getChat(id) : null;
  return chat ? NextResponse.json({ chat }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Deletes the conversation and its note: the coach forgets it entirely. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!isChatId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteChat(id);
  return NextResponse.json({ ok: true });
}
