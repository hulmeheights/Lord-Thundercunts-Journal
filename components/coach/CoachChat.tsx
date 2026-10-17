"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Dot } from "@/components/m";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's my single biggest leak right now?",
  "Grade my last week like a prop firm risk manager would.",
  "When should I stop trading each day?",
  "Which setup should I size up, and which should I drop?",
  "Build me a pre-market routine based on my data.",
  "Am I on track to pass my evaluation?",
];

type Past = { id: string; title: string; note: string | null; commitments: string[]; messageCount: number; updatedAt: string };

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? `${days} days ago` : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/** Tiny, safe formatter: paragraphs, bullet lists and **bold** — no HTML injection. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string, k: number) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${k}-${i}`} className="font-normal text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={`${k}-${i}`}>{part}</span>
      ),
    );
  return (
    <div className="space-y-3">
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={bi} className="space-y-1.5">
              {lines.map((l, li) => (
                <li key={li} className="grid grid-cols-[1.6rem_1fr]">
                  <span className="text-gold">{String(li + 1).padStart(2, "0")}</span>
                  <span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), li)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (/^#{1,4}\s/.test(b)) return <div key={bi} className="font-serif text-[1.25rem] font-light text-ink">{b.replace(/^#{1,4}\s/, "")}</div>;
        return <p key={bi}>{lines.map((l, li) => <span key={li}>{inline(l, li)}{li < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}

export function CoachChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [past, setPast] = useState<Past[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadPast = async () => {
    const r = await fetch("/api/coach/chats").then((x) => x.json()).catch(() => null);
    if (r?.chats) setPast(r.chats);
  };
  useEffect(() => {
    void loadPast();
  }, []);
  useEffect(() => {
    if (messages.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const fresh = () => {
    setMessages([]);
    setChatId(null);
    void loadPast();
  };
  const open = async (id: string) => {
    const r = await fetch(`/api/coach/chats/${id}`).then((x) => x.json()).catch(() => null);
    if (r?.chat) {
      setChatId(r.chat.id);
      setMessages(r.chat.messages);
    }
  };
  const forget = async (id: string) => {
    if (!confirm("Delete this conversation? The coach forgets it completely.")) return;
    await fetch(`/api/coach/chats/${id}`, { method: "DELETE" });
    setPast((p) => p?.filter((c) => c.id !== id) ?? null);
    if (id === chatId) fresh();
  };

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, messages: history.filter((m) => m.content.trim()).slice(-40) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        // Say why, instead of a generic "couldn't reach" (e.g. the key is missing or AI is switched off).
        const why = (await res.text().catch(() => "")).trim().slice(0, 200);
        setMessages([...history, { role: "assistant", content: `The coach couldn't answer${why ? `: ${why}` : ` (error ${res.status})`}.` }]);
        return;
      }
      const id = res.headers.get("x-chat-id");
      if (id) setChatId(id);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages([...history, { role: "assistant", content: "I couldn't reach the coach just now. Try again in a moment." }]);
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-420px)] flex-col">
      <div className="flex-1 pb-10">
        {messages.length === 0 ? (
          <div>
            <div className="label reveal mb-6">01 — Ask the hard questions</div>
            <div className="border-t border-line">
              {SUGGESTIONS.map((q, i) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="reveal m-row grid w-full grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-b border-line py-[clamp(1.1rem,2.6vh,1.6rem)] text-left"
                  style={{ "--d": `${i * 50}ms` } as React.CSSProperties}
                >
                  <span className="font-mono text-[11px] text-gold">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-serif text-[clamp(1.2rem,2.4vw,1.7rem)] leading-[1.25] font-light">{q}</span>
                  <span className="font-mono text-[12px] text-ink-4">→</span>
                </button>
              ))}
            </div>

            {past && past.length > 0 && (
              <div className="mt-[clamp(3.5rem,9vh,6rem)]">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4">
                  <div className="label">02 — What the coach remembers</div>
                  <span className="font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase">Delete anything pointless · it&apos;s forgotten</span>
                </div>
                <p className="mb-6 max-w-[60ch] font-mono text-[11px] leading-[1.85] text-ink-3">
                  After each chat the coach keeps a short note: what you talked about and what you committed to. New chats read the recent notes, not the old transcripts.
                </p>
                <div className="border-t border-line">
                  {past.map((c) => (
                    <div key={c.id} className="grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-2 border-b border-line py-5">
                      <button onClick={() => open(c.id)} className="m-row min-w-0 text-left">
                        <span className="block font-serif text-[clamp(1.1rem,2vw,1.35rem)] leading-[1.3] font-light">{c.title}</span>
                        {c.note ? (
                          <span className="mt-2 block max-w-[70ch] font-mono text-[11px] leading-[1.8] text-ink-2">{c.note}</span>
                        ) : (
                          <span className="mt-2 block font-mono text-[11px] text-ink-4">Note on its way…</span>
                        )}
                        {c.commitments.length > 0 && (
                          <span className="mt-2 block font-mono text-[10.5px] leading-[1.8] text-ink-3">
                            <span className="mr-2 text-gold">◆ Committed</span>
                            {c.commitments.join(" · ")}
                          </span>
                        )}
                        <span className="mt-2 block font-mono text-[9px] tracking-[0.28em] text-ink-4 uppercase">
                          {when(c.updatedAt)} · {Math.ceil(c.messageCount / 2)} exchange{c.messageCount > 2 ? "s" : ""} · open →
                        </span>
                      </button>
                      <button onClick={() => forget(c.id)} className="pt-1 font-mono text-[9.5px] tracking-[0.26em] text-ink-4 uppercase hover:text-ink" aria-label={`Delete ${c.title}`}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-line">
            {messages.map((m, i) => (
              <div key={i} className="grid gap-x-8 gap-y-3 border-b border-line py-8 md:grid-cols-[8rem_1fr]">
                <div className={cn("font-mono text-[9.5px] tracking-[0.3em] uppercase", m.role === "user" ? "text-ink-4" : "text-gold")}>
                  {m.role === "user" ? "You" : "Thunder ◆"}
                </div>
                {m.role === "user" ? (
                  <p className="max-w-[40ch] font-serif text-[clamp(1.2rem,2.3vw,1.6rem)] leading-[1.35] font-light italic">{m.content}</p>
                ) : (
                  <div className="max-w-[68ch] font-mono text-[12.5px] leading-[1.95] tracking-[0.02em] text-ink-2">
                    {m.content ? (
                      <Rich text={m.content} />
                    ) : (
                      <span className="inline-flex items-center gap-3 text-ink-4">
                        <Dot tone="gold" /> Reading your trades…
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-[calc(84px+var(--safe-bottom))] bg-bg pt-3 pb-4 lg:bottom-0 lg:pb-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-5 border-b border-line-2 pb-3 transition-colors focus-within:border-gold"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={6000}
            aria-label="Ask the coach"
            placeholder="Ask about your trading…"
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 font-serif text-[clamp(1.15rem,2vw,1.4rem)] font-light text-ink placeholder:text-ink-4 placeholder:italic focus:outline-none"
          />
          <div className="flex shrink-0 items-center gap-5 pb-1.5 font-mono text-[9.5px] tracking-[0.3em] uppercase [&_button]:uppercase">
            {messages.length > 0 && !busy && (
              <button type="button" onClick={fresh} className="text-ink-4 hover:text-ink">
                New
              </button>
            )}
            {chatId && !busy && (
              <button type="button" onClick={() => forget(chatId)} className="text-ink-4 hover:text-ink">
                Delete
              </button>
            )}
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} className="text-ink hover:text-ink-2">
                ■ Stop
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="text-ink transition-opacity disabled:opacity-30">
                Send →
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
