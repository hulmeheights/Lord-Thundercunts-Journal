"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, RotateCcw, Square } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

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
        <strong key={`${k}-${i}`} className="font-semibold text-ink">
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
                <li key={li} className="flex gap-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                  <span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), li)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (/^#{1,4}\s/.test(b)) return <div key={bi} className="text-[15px] font-semibold text-ink">{b.replace(/^#{1,4}\s/, "")}</div>;
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
    <div className="flex min-h-[calc(100dvh-220px)] flex-col">
      <div className="flex-1 space-y-5 pb-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-8 text-center">
            <LogoMark size={64} glow />
            <h2 className="title-lg mt-5">Ask Thunder anything.</h2>
            <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-3">
              Your coach has read every trade, rule break and journal entry from the last 90 days. Ask it the hard questions.
            </p>
            <div className="mt-7 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="glass rounded-2xl px-4 py-3 text-left text-[13.5px] leading-snug text-ink-2 transition-colors hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}
              >
                {m.role === "assistant" && <LogoMark size={28} className="mt-1" />}
                <div
                  className={cn(
                    "max-w-[85%] rounded-[22px] px-4 py-3 text-[14.5px] leading-relaxed",
                    m.role === "user" ? "rounded-br-md bg-ink text-bg" : "glass rounded-bl-md text-ink-2",
                  )}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <Rich text={m.content} />
                    ) : (
                      <span className="inline-flex gap-1 py-1">
                        {[0, 1, 2].map((d) => (
                          <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-3" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }} />
                        ))}
                      </span>
                    )
                  ) : (
                    m.content
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-[calc(96px+var(--safe-bottom))] lg:bottom-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="glass-strong flex items-end gap-2 rounded-[26px] p-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]"
        >
          {messages.length > 0 && !busy && (
            <button type="button" onClick={() => setMessages([])} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-3 hover:text-ink" aria-label="New chat">
              <RotateCcw size={17} />
            </button>
          )}
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
            placeholder="Ask about your trading…"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-4 focus:outline-none"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fill-3 text-ink" aria-label="Stop">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-bg transition-opacity disabled:opacity-30" aria-label="Send">
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
