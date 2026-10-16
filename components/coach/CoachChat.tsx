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

const STORE = "ltj:coach";

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
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

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
        body: JSON.stringify({ messages: history.slice(-20).filter((m) => m.content.trim()) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
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
          <div className="flex shrink-0 items-center gap-5 pb-1.5 font-mono text-[9.5px] tracking-[0.3em] uppercase">
            {messages.length > 0 && !busy && (
              <button type="button" onClick={() => setMessages([])} className="text-ink-4 hover:text-ink">
                New
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
