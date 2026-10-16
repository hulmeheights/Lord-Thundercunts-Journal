import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { deletePhoto, readPhoto, setCaption } from "@/lib/data/photos";

const ID = /^ph_[\w-]{8,40}$/;

/** The photo itself, decrypted for the signed-in owner only. Never cached by anything shared. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  if (!ID.test(id)) return new NextResponse("Not found", { status: 404 });
  const photo = await readPhoto(id);
  if (!photo) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "content-type": photo.mime,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { caption?: unknown };
  const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 280) || null : null;
  await setCaption(id, caption);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deletePhoto(id);
  return NextResponse.json({ ok: true });
}
