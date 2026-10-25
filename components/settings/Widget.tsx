"use client";

import { useState, useTransition } from "react";
import { newWidgetLink, revokeWidgetLink } from "@/lib/actions/settings";
import { Button } from "@/components/ui/Button";
import { Note, SRow } from "./ui";

/** The Scriptable script: one file that draws every widget size from the feed. */
function script(origin: string, token: string) {
  return `// Thunder ◆ widget for Scriptable. Lock Screen (rectangular or inline) and Home Screen (small, medium, large).
const URL_ = "${origin}/api/widget";
const KEY = "${token}";

const req = new Request(URL_);
req.headers = { Authorization: "Bearer " + KEY };
let d;
try { d = await req.loadJSON(); } catch (e) { d = null; }

const ink = new Color("#ece7dd"), dim = new Color("#ece7dd", 0.55), gold = new Color("#bd9e63");
const fam = config.widgetFamily || "medium";
const w = new ListWidget();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
w.url = "${origin}/";

function t(stack, s, font, color, lines) {
  const x = stack.addText(s); x.font = font; x.textColor = color; if (lines) x.lineLimit = lines; return x;
}

// A quote arrives as “text”\n— author; everything else as a title (Pray, Thankful…) and a body.
const isQuote = d && d.title === "Thought for the day";
const words = d ? (isQuote ? d.body.split("\n")[0] : d.body) : "";
const by = d ? (isQuote ? (d.body.split("\n")[1] || "").replace(/^— /, "") : d.title) : "";

if (!d || d.error) {
  t(w, "◆ Thunder", Font.semiboldSystemFont(12), gold);
  t(w, "Open Settings → Widget in the journal to make a new key.", Font.systemFont(11), dim, 3);
} else if (fam === "accessoryInline") {
  t(w, "◆ " + d.status + (d.streak ? " · " + d.streak + " clean" : ""), Font.systemFont(12), ink, 1);
} else if (fam === "accessoryRectangular") {
  // The Lock Screen tints everything one colour and gives ~3 short lines, so: the words only, large and clear.
  w.addAccessoryWidgetBackground = true;
  t(w, words, Font.semiboldSystemFont(14), ink, 3).minimumScaleFactor = 0.7;
} else if (fam === "accessoryCircular") {
  w.addSpacer();
  const n = t(w, String(d.streak), Font.semiboldRoundedSystemFont(20), ink, 1); n.centerAlignText();
  const l = t(w, "clean", Font.systemFont(9), dim, 1); l.centerAlignText();
  w.addSpacer();
} else {
  w.backgroundColor = new Color("#0a0a0b");
  w.setPadding(14, 16, 14, 16);
  const top = w.addStack(); top.centerAlignContent();
  t(top, "◆", Font.systemFont(10), gold);
  top.addSpacer(6);
  t(top, d.status.toUpperCase(), Font.mediumMonospacedSystemFont(9), dim, 1);
  w.addSpacer(fam === "small" ? 8 : 10);
  const big = fam === "large";
  t(w, words, new Font("Georgia", fam === "small" ? 13 : big ? 19 : 15), ink, fam === "small" ? 5 : big ? 10 : 4);
  w.addSpacer(6);
  t(w, "— " + by, Font.italicSystemFont(fam === "small" ? 10 : 11), gold, 1);
  w.addSpacer();
  const foot = w.addStack();
  t(foot, (d.window ? d.window + "  ·  " : "") + d.streak + " clean in a row", Font.mediumMonospacedSystemFont(9), dim, 1);
  if (fam !== "small") { foot.addSpacer(); t(foot, d.mission, Font.italicSystemFont(10), dim, 1); }
}

if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
`;
}

/** A Home or Lock Screen widget through the free Scriptable app: today's line, your window, your streak. */
export function Widget({ active, lastUsed }: { active: boolean; lastUsed: string | null }) {
  const [code, setCode] = useState<string | null>(null);
  const [on, setOn] = useState(active);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();

  const make = () =>
    start(async () => {
      const { token } = await newWidgetLink();
      setCode(script(window.location.origin, token));
      setOn(true);
      setCopied(false);
    });
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <SRow
        name="Widget key"
        hint={
          on
            ? `A widget key is active${lastUsed ? `, last read ${lastUsed}` : ""}. It can only read today's quote, your window and your streak: never trades, money or accounts.`
            : "Makes a private key the widget uses to read today's quote, your window and your streak. Nothing else is reachable with it."
        }
      >
        <div className="flex flex-wrap gap-3">
          <Button onClick={make} disabled={busy}>
            {on ? "Make a new key" : "Set up the widget"}
          </Button>
          {on && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  await revokeWidgetLink();
                  setOn(false);
                  setCode(null);
                })
              }
            >
              Turn off
            </Button>
          )}
        </div>
      </SRow>

      {code && (
        <div className="mt-6 space-y-4">
          <Note tone="pos">Key made. It's shown once: copy the script now. Making a new key turns the old one off.</Note>
          <ol className="list-decimal space-y-1.5 pl-5 font-mono text-[11px] leading-[1.8] text-ink-3">
            <li>Install Scriptable (free) from the App Store.</li>
            <li>In Scriptable tap +, paste the script, and name it Thunder.</li>
            <li>Lock Screen: long-press it → Customise → Lock Screen → add Scriptable (the rectangular one) → tap it → Script: Thunder.</li>
            <li>Home Screen: long-press → + → Scriptable → pick a size → tap it → Script: Thunder.</li>
          </ol>
          <div className="flex gap-3">
            <Button onClick={copy}>{copied ? "Copied ◆" : "Copy the script"}</Button>
          </div>
          <textarea readOnly value={code} rows={8} aria-label="Widget script" className="field w-full font-mono text-[10.5px] leading-[1.6]" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}
