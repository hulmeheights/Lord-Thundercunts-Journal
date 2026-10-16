import { NextResponse } from "next/server";
import { assertSameOrigin, assertSession } from "@/lib/auth/session";
import { addPhoto, MAX_PHOTO_BYTES, sniffMime } from "@/lib/data/photos";

export const maxDuration = 30;

/** Upload one photo to a journal day. The browser has already shrunk it; the server checks it's really an image. */
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    await assertSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const day = String(form?.get("day") ?? "");
  const caption = String(form?.get("caption") ?? "").trim().slice(0, 280) || null;
  const width = Number(form?.get("width"));
  const height = Number(form?.get("height"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "Bad day." }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "No photo." }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "That photo is too large even after shrinking." }, { status: 413 });
  if (!(width > 0 && width <= 8000 && height > 0 && height <= 8000)) return NextResponse.json({ error: "Bad size." }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(data);
  if (!mime) return NextResponse.json({ error: "Only photos (JPEG, PNG or WebP)." }, { status: 415 });
  try {
    const photo = await addPhoto({ day, caption, mime, width: Math.round(width), height: Math.round(height), data });
    return NextResponse.json({ photo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save the photo." }, { status: 400 });
  }
}
