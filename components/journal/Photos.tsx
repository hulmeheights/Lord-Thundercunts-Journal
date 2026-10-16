"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { JournalPhoto } from "@/lib/data/photos";
import { Label } from "@/components/m";

const MAX_EDGE = 2000;

/** Shrink on the device before upload: longest edge 2000px, WebP (JPEG where WebP isn't supported). */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) throw new Error(`${file.name} isn't a photo this browser can read.`);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob("image/webp", 0.84);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.86);
  if (!blob) throw new Error(`Couldn't prepare ${file.name}.`);
  return { blob, width, height };
}

const src = (id: string) => `/api/journal/photos/${id}`;

/**
 * Photos for a journal day: the chart you marked up, the screen at the moment
 * it went wrong, the notebook page. Stored encrypted, shown only to you.
 */
export function Photos({ day, initial }: { day: string; initial: JournalPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!list.length) return;
    setError(null);
    setBusy((b) => b + list.length);
    for (const file of list) {
      try {
        const { blob, width, height } = await shrink(file);
        const fd = new FormData();
        fd.set("file", blob, "photo");
        fd.set("day", day);
        fd.set("width", String(width));
        fd.set("height", String(height));
        const res = await fetch("/api/journal/photos", { method: "POST", body: fd });
        const j = (await res.json().catch(() => ({}))) as { photo?: JournalPhoto; error?: string };
        if (!res.ok || !j.photo) throw new Error(j.error ?? "Couldn't save that photo.");
        setPhotos((p) => [...p, j.photo!]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that photo.");
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this photo? It can't be undone.")) return;
    const res = await fetch(src(id), { method: "DELETE" });
    if (res.ok) {
      setPhotos((p) => p.filter((x) => x.id !== id));
      setOpen(null);
    }
  };

  const caption = async (id: string, text: string) => {
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, caption: text || null } : x)));
    await fetch(src(id), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ caption: text }) });
  };

  return (
    <section
      className={cn("reveal border-t pt-6 transition-colors duration-300", over ? "border-gold" : "border-line")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
        <Label>Photos</Label>
        <span className="font-mono text-[9.5px] tracking-[0.3em] text-ink-4 uppercase">
          {busy ? `Adding ${busy}…` : photos.length ? `${photos.length} · encrypted` : "Encrypted · only you"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setOpen(i)}
            className="group relative aspect-square overflow-hidden border border-line bg-surface"
            aria-label={p.caption ? `Photo: ${p.caption}` : `Photo ${i + 1}`}
          >
            {/* Served from our own encrypted store; next/image would cache it on the server. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(p.id)} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover opacity-90 transition-[opacity,transform] duration-500 group-hover:scale-[1.03] group-hover:opacity-100" />
          </button>
        ))}
        <button
          onClick={() => input.current?.click()}
          className={cn(
            "flex aspect-square flex-col items-center justify-center gap-2 border border-dashed font-mono text-[9.5px] tracking-[0.26em] uppercase transition-colors duration-300",
            over ? "border-gold text-gold" : "border-line-2 text-ink-4 hover:border-ink-3 hover:text-ink-2",
            photos.length === 0 && "col-span-3 aspect-auto py-10 sm:col-span-4",
          )}
        >
          <span className="text-[16px] leading-none">+</span>
          {photos.length === 0 ? "Add photos · drop them here, or take one" : "Add"}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="mt-4 font-mono text-[11px] text-ink" role="alert">
          <span className="mr-2 text-gold">◆</span>
          {error}
        </p>
      )}

      {open !== null && photos[open] && (
        <Viewer
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onDelete={remove}
          onCaption={caption}
        />
      )}
    </section>
  );
}

function Viewer({
  photos,
  index,
  onIndex,
  onClose,
  onDelete,
  onCaption,
}: {
  photos: JournalPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onCaption: (id: string, text: string) => void;
}) {
  const p = photos[index]!;
  const [text, setText] = useState(p.caption ?? "");
  const [shown, setShown] = useState(p.id);
  if (shown !== p.id) {
    setShown(p.id);
    setText(p.caption ?? "");
  }

  useEffect(() => {
    const lenis = window.__lenis;
    lenis?.stop();
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(photos.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      lenis?.start();
      window.removeEventListener("keydown", onKey);
    };
  }, [index, photos.length, onClose, onIndex]);

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-bg/97 px-[clamp(1rem,4vw,3rem)] py-[clamp(1rem,3vh,2rem)]" role="dialog" aria-modal="true" aria-label="Photo" data-lenis-prevent>
      <div className="flex items-center justify-between font-mono text-[9.5px] tracking-[0.3em] uppercase">
        <span className="num text-ink-3" data-public>
          {String(index + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}
        </span>
        <div className="flex items-center gap-7">
          <a href={src(p.id)} target="_blank" rel="noopener" className="text-ink-4 hover:text-ink">
            Full size ↗
          </a>
          <button onClick={() => onDelete(p.id)} className="text-ink-4 hover:text-ink">
            Delete
          </button>
          <button onClick={onClose} className="text-ink-2 hover:text-ink" autoFocus>
            Close ×
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center py-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} className="absolute left-0 z-10 p-3 font-mono text-[14px] text-ink-3 hover:text-ink" aria-label="Previous photo">
            ←
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src(p.id)} alt={p.caption ?? ""} data-private className="max-h-full max-w-full object-contain" />
        {index < photos.length - 1 && (
          <button onClick={() => onIndex(index + 1)} className="absolute right-0 z-10 p-3 font-mono text-[14px] text-ink-3 hover:text-ink" aria-label="Next photo">
            →
          </button>
        )}
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (p.caption ?? "") && onCaption(p.id, text)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        maxLength={280}
        placeholder="Add a caption…"
        aria-label="Caption"
        className="mx-auto w-full max-w-2xl border-0 border-b border-line-2 bg-transparent py-2 text-center font-serif text-[clamp(1.05rem,2vw,1.3rem)] font-light text-ink outline-none placeholder:text-ink-4 placeholder:italic focus:border-gold"
      />
    </div>,
    document.body,
  );
}
