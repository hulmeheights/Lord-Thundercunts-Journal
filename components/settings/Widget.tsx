"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { newWidgetLink, revokeWidgetLink, saveWidgetStyle, widgetPreviewLine } from "@/lib/actions/settings";
import { ACCENTS, FONTS, FOOTER, KINDS, LOCKS, THEMES, TOPS, quoteLines, quoteSize, type FooterItem, type Kind, type WidgetStyle } from "@/lib/widget/style";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Seg } from "@/components/m/Seg";
import { cn } from "@/lib/cn";
import { Note, SRow, Sub } from "./ui";

export type PreviewData = {
  line: { kind: string; words: string; by: string };
  status: string;
  date: string;
  window: string | null;
  streak: number;
  mission: string;
  funded: number;
  payouts: number;
  paidOut: number;
};

/**
 * The Scriptable script. It only knows where to fetch and its key: every look
 * setting arrives with the feed, so changes in Settings reach the phone on the
 * widget's next refresh without pasting anything again.
 */
function script(origin: string, token: string) {
  return `// Thunder ◆ widget for Scriptable. Change how it looks in the journal: Settings → Widget.
const URL_ = "${origin}/api/widget";
const KEY = "${token}";

const req = new Request(URL_);
req.headers = { Authorization: "Bearer " + KEY };
let d = null;
try { d = await req.loadJSON(); } catch (e) {}

const THEMES = ${JSON.stringify(Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, { bg: v.bg, ink: v.ink, dim: v.dim }])))};
const ACCENTS = ${JSON.stringify(Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.hex])))};
const s = Object.assign({ theme: "night", accent: "gold", font: "serif", size: "m", align: "left", top: "status", author: true, border: false, footer: ["window", "streak", "mission"], lock: "words", refresh: 15 }, (d && d.style) || {});
const th = THEMES[s.theme] || THEMES.night;
const ink = new Color(th.ink), dim = new Color(th.dim), accent = new Color(ACCENTS[s.accent] || ACCENTS.gold);
const fam = config.widgetFamily || "medium";
const scale = s.size === "s" ? 0.87 : s.size === "l" ? 1.15 : 1;
const qsize = Math.round((fam === "small" ? 13 : fam === "large" ? 19 : 15) * scale);
const qlines = fam === "small" ? 5 : fam === "large" ? 10 : 4;
function qfont(n) {
  if (s.font === "sans") return Font.systemFont(n);
  if (s.font === "rounded") return Font.regularRoundedSystemFont(n);
  if (s.font === "mono") return Font.regularMonospacedSystemFont(n - 1);
  return new Font("Georgia", n);
}
function footer() {
  const out = [];
  for (const f of s.footer) {
    if (f === "window" && d.window) out.push(d.window);
    if (f === "streak") out.push(d.streak + " clean in a row");
    if (f === "mission") out.push(d.mission);
    if (f === "funded" && d.funded !== undefined) out.push(d.funded + " funded");
    if (f === "payouts" && d.payouts !== undefined) out.push(d.payouts + (d.payouts === 1 ? " payout" : " payouts"));
    if (f === "paidOut" && d.paidOut !== undefined) out.push("$" + d.paidOut.toLocaleString() + " paid out");
  }
  return out.join("  ·  ");
}
const top = d ? (s.top === "status" ? d.status : s.top === "date" ? d.date : s.top === "mission" ? d.mission : "") : "";
const words = d ? (d.words || d.body || "") : "";
const by = d ? (d.by || d.title || "") : "";
const author = d && d.kind === "quote" ? "— " + by : by;

const w = new ListWidget();
w.refreshAfterDate = new Date(Date.now() + (s.refresh || 15) * 60 * 1000);
w.url = "${origin}/";
function t(stack, str, font, color, lines) {
  const x = stack.addText(str); x.font = font; x.textColor = color; if (lines) x.lineLimit = lines;
  if (s.align === "center") x.centerAlignText();
  return x;
}

if (!d || d.error) {
  t(w, "◆ Thunder", Font.semiboldSystemFont(12), accent);
  t(w, "Open the journal: Settings → Widget → Make a new key.", Font.systemFont(11), dim, 3);
} else if (fam === "accessoryInline") {
  t(w, "◆ " + (s.lock === "words" ? words : d.status + " · " + d.streak + " clean"), Font.systemFont(12), ink, 1);
} else if (fam === "accessoryCircular") {
  w.addSpacer();
  const n = w.addText(String(d.streak)); n.font = Font.semiboldRoundedSystemFont(20); n.centerAlignText();
  const l = w.addText("clean"); l.font = Font.systemFont(9); l.centerAlignText();
  w.addSpacer();
} else if (fam === "accessoryRectangular") {
  w.addAccessoryWidgetBackground = true;
  if (s.lock === "words") {
    t(w, words, Font.semiboldSystemFont(14), ink, 3).minimumScaleFactor = 0.7;
  } else if (s.lock === "status-words") {
    t(w, "◆ " + d.status, Font.semiboldSystemFont(12), ink, 1);
    t(w, words, Font.systemFont(12), ink, 2).minimumScaleFactor = 0.8;
  } else {
    t(w, "◆ " + d.streak + " clean in a row", Font.semiboldSystemFont(14), ink, 1);
    t(w, d.status, Font.systemFont(12), ink, 1);
    t(w, d.mission, Font.systemFont(11), ink, 1);
  }
} else {
  w.backgroundColor = new Color(th.bg);
  w.setPadding(s.border ? 8 : 14, s.border ? 8 : 16, s.border ? 8 : 14, s.border ? 8 : 16);
  const c = w.addStack(); c.layoutVertically();
  if (s.border) { c.borderWidth = 1; c.borderColor = new Color(ACCENTS[s.accent] || ACCENTS.gold, 0.45); c.cornerRadius = 14; c.setPadding(8, 10, 8, 10); }
  if (top) {
    const row = c.addStack(); row.centerAlignContent();
    if (s.align === "center") row.addSpacer();
    const dia = row.addText("◆"); dia.font = Font.systemFont(10); dia.textColor = accent;
    row.addSpacer(6);
    const tx = row.addText(top.toUpperCase()); tx.font = Font.mediumMonospacedSystemFont(9); tx.textColor = dim; tx.lineLimit = 1;
    row.addSpacer();
    c.addSpacer(fam === "small" ? 8 : 10);
  }
  if (s.align === "center") c.addSpacer();
  const wrow = c.addStack(); if (s.align === "center") wrow.addSpacer();
  const wt = wrow.addText(words); wt.font = qfont(qsize); wt.textColor = ink; wt.lineLimit = qlines; if (s.align === "center") wt.centerAlignText();
  if (s.align === "center") wrow.addSpacer();
  if (s.author && author) {
    c.addSpacer(6);
    const arow = c.addStack(); if (s.align === "center") arow.addSpacer();
    const at = arow.addText(author); at.font = Font.italicSystemFont(fam === "small" ? 10 : 11); at.textColor = accent; at.lineLimit = 1;
    if (s.align === "center") arow.addSpacer();
  }
  c.addSpacer();
  const foot = footer();
  if (foot) {
    const frow = c.addStack(); if (s.align === "center") frow.addSpacer();
    const ft = frow.addText(foot); ft.font = Font.mediumMonospacedSystemFont(9); ft.textColor = dim; ft.lineLimit = 1; ft.minimumScaleFactor = 0.7;
    if (s.align === "center") frow.addSpacer();
  }
}

if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
`;
}

/** The footer text, built the same way the script builds it. */
function footerText(s: WidgetStyle, p: PreviewData) {
  const out: string[] = [];
  for (const f of s.footer) {
    if (f === "window" && p.window) out.push(p.window);
    if (f === "streak") out.push(`${p.streak} clean in a row`);
    if (f === "mission") out.push(p.mission);
    if (f === "funded") out.push(`${p.funded} funded`);
    if (f === "payouts") out.push(`${p.payouts} ${p.payouts === 1 ? "payout" : "payouts"}`);
    if (f === "paidOut") out.push(`$${p.paidOut.toLocaleString("en-US")} paid out`);
  }
  return out.join("  ·  ");
}

function HomePreview({ s, p, family }: { s: WidgetStyle; p: PreviewData; family: "small" | "medium" | "large" }) {
  const th = THEMES[s.theme];
  const accent = ACCENTS[s.accent].hex;
  const top = s.top === "status" ? p.status : s.top === "date" ? p.date : s.top === "mission" ? p.mission : "";
  const author = p.line.kind === "quote" ? `— ${p.line.by}` : p.line.by;
  const foot = footerText(s, p);
  const box = family === "small" ? "h-[158px] w-[158px]" : family === "medium" ? "h-[158px] w-[338px]" : "h-[354px] w-[338px]";
  const center = s.align === "center";
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-[22px] shadow-[0_8px_30px_rgba(0,0,0,0.35)]", box)} style={{ background: th.bg }}>
      <div
        className={cn("flex h-full flex-col", s.border ? "m-2 h-[calc(100%-16px)] rounded-[14px] border px-2.5 py-2" : "px-4 py-3.5", center && "items-center text-center")}
        style={s.border ? { borderColor: `${accent}73` } : undefined}
      >
        {top && (
          <div className={cn("mb-2 flex w-full items-center gap-1.5 overflow-hidden", center && "justify-center")}>
            <span style={{ color: accent, fontSize: 10 }}>◆</span>
            <span className="truncate font-mono text-[9px] tracking-[0.08em] uppercase" style={{ color: th.dim }}>
              {top}
            </span>
          </div>
        )}
        <div className={cn("flex min-h-0 flex-1 flex-col", center ? "justify-center" : "justify-start")}>
          <p
            className="w-full overflow-hidden"
            style={{
              color: th.ink,
              fontFamily: FONTS[s.font].css,
              fontSize: quoteSize(family, s.size) - (s.font === "mono" ? 1 : 0),
              lineHeight: 1.25,
              display: "-webkit-box",
              WebkitLineClamp: quoteLines(family),
              WebkitBoxOrient: "vertical",
            }}
          >
            {p.line.words}
          </p>
          {s.author && author && (
            <p className="mt-1.5 w-full truncate italic" style={{ color: accent, fontSize: family === "small" ? 10 : 11 }}>
              {author}
            </p>
          )}
        </div>
        {foot && (
          <p className="mt-2 w-full truncate font-mono text-[9px]" style={{ color: th.dim }}>
            {foot}
          </p>
        )}
      </div>
    </div>
  );
}

function LockPreview({ s, p }: { s: WidgetStyle; p: PreviewData }) {
  const line =
    s.lock === "words" ? (
      <p className="line-clamp-3 text-[14px] leading-[1.2] font-semibold">{p.line.words}</p>
    ) : s.lock === "status-words" ? (
      <>
        <p className="truncate text-[12px] font-semibold">◆ {p.status}</p>
        <p className="line-clamp-2 text-[12px] leading-[1.2]">{p.line.words}</p>
      </>
    ) : (
      <>
        <p className="truncate text-[14px] font-semibold">◆ {p.streak} clean in a row</p>
        <p className="truncate text-[12px]">{p.status}</p>
        <p className="truncate text-[11px]">{p.mission}</p>
      </>
    );
  return (
    <div className="w-[338px] shrink-0 rounded-[22px] bg-gradient-to-b from-[#3a3f4b] to-[#1d2027] px-5 pt-4 pb-6 text-white/85" style={{ fontFamily: FONTS.sans.css }}>
      <p className="text-center text-[15px] font-medium text-white/80">{p.date}</p>
      <p className="text-center text-[64px] leading-none font-semibold tracking-tight text-white/85">09:41</p>
      <div className="mt-3 w-[170px] rounded-xl bg-white/10 px-2.5 py-1.5">{line}</div>
      <p className="mt-3 text-[10px] text-white/50">The Lock Screen tints widgets one colour; colours and fonts apply to the Home Screen widget only.</p>
    </div>
  );
}

function Swatches<K extends string>({ value, onChange, options }: { value: K; onChange: (k: K) => void; options: { key: K; label: string; colour: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.key)}
          className={cn("h-8 w-8 rounded-full border transition-transform duration-200", value === o.key ? "scale-110 border-gold ring-2 ring-gold/40" : "border-line-2 hover:scale-105")}
          style={{ background: o.colour }}
        />
      ))}
    </div>
  );
}

function Checks<K extends string>({ value, onChange, options, max }: { value: K[]; onChange: (v: K[]) => void; options: Record<K, string>; max?: number }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {(Object.keys(options) as K[]).map((k) => {
        const on = value.includes(k);
        const full = !on && max !== undefined && value.length >= max;
        return (
          <label key={k} className={cn("flex cursor-pointer items-center gap-2 font-mono text-[11.5px]", on ? "text-ink" : "text-ink-4", full && "cursor-not-allowed opacity-40")}>
            <input type="checkbox" className="accent-[var(--gold)]" checked={on} disabled={full} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />
            {options[k]}
          </label>
        );
      })}
    </div>
  );
}

/** A Home or Lock Screen widget through the free Scriptable app, styled here and previewed live. */
export function Widget({ active, lastUsed, initial, preview }: { active: boolean; lastUsed: string | null; initial: WidgetStyle; preview: PreviewData }) {
  const [code, setCode] = useState<string | null>(null);
  const [on, setOn] = useState(active);
  const [copied, setCopied] = useState(false);
  const [s, setS] = useState<WidgetStyle>(initial);
  const [line, setLine] = useState(preview.line);
  const [saved, setSaved] = useState<string>("idle");
  const [busy, start] = useTransition();
  const first = useRef(true);
  const p = { ...preview, line };

  // Save a moment after the last change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    const t = setTimeout(async () => {
      const r = await saveWidgetStyle(s);
      setSaved("error" in r && r.error ? r.error : "saved");
    }, 500);
    return () => clearTimeout(t);
  }, [s]);
  // The exact line today's mix of kinds gives, straight from the server.
  const kindsKey = s.kinds.join(",");
  useEffect(() => {
    if (kindsKey === initial.kinds.join(",")) return setLine(preview.line);
    widgetPreviewLine(kindsKey.split(",")).then(setLine).catch(() => {});
  }, [kindsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof WidgetStyle>(k: K, v: WidgetStyle[K]) => setS((x) => ({ ...x, [k]: v }));
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
  const label = "mb-3 block font-mono text-[9.5px] tracking-[0.24em] text-ink-4 uppercase";
  const status = saved === "saved" ? `Saved · on your phone within ${s.refresh} min` : saved === "saving" ? "Saving…" : saved === "idle" ? "Changes save as you go" : saved;

  return (
    <div>
      <Sub aside={<span className={cn("font-mono text-[10px]", saved === "saved" ? "text-pos" : saved === "saving" || saved === "idle" ? "text-ink-4" : "text-ink")}>{status}</span>}>Preview · today</Sub>
      <div className="-mx-4 mt-5 overflow-x-auto px-4 pb-4">
        <div className="flex w-max items-start gap-5">
          <div className="space-y-5">
            <HomePreview s={s} p={p} family="medium" />
            <div className="flex gap-5">
              <HomePreview s={s} p={p} family="small" />
              <div className="flex w-[158px] flex-col justify-end font-mono text-[10px] leading-[1.7] text-ink-4">
                <span>Home Screen: medium and small.</span>
                <span>Swipe for large and Lock Screen →</span>
              </div>
            </div>
          </div>
          <HomePreview s={s} p={p} family="large" />
          <LockPreview s={s} p={p} />
        </div>
      </div>

      <div className="mt-6 grid max-w-4xl gap-x-12 gap-y-7 md:grid-cols-2">
        <div>
          <span className={label}>Background</span>
          <Swatches value={s.theme} onChange={(v) => set("theme", v)} options={(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => ({ key: k, label: THEMES[k].label, colour: THEMES[k].bg }))} />
          <p className="mt-2 font-mono text-[10.5px] text-ink-4">{THEMES[s.theme].label}</p>
        </div>
        <div>
          <span className={label}>Accent</span>
          <Swatches value={s.accent} onChange={(v) => set("accent", v)} options={(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((k) => ({ key: k, label: ACCENTS[k].label, colour: ACCENTS[k].hex }))} />
          <p className="mt-2 font-mono text-[10.5px] text-ink-4">{ACCENTS[s.accent].label} · the ◆ and the author line</p>
        </div>
        <div>
          <span className={label}>Font</span>
          <Seg value={s.font} onChange={(v) => set("font", v)} options={(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((k) => ({ value: k, label: FONTS[k].label }))} />
        </div>
        <div>
          <span className={label}>Text size</span>
          <Seg value={s.size} onChange={(v) => set("size", v)} options={[{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }]} />
        </div>
        <div>
          <span className={label}>Alignment</span>
          <Seg value={s.align} onChange={(v) => set("align", v)} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centred" }]} />
        </div>
        <div>
          <span className={label}>Top line</span>
          <Seg value={s.top} onChange={(v) => set("top", v)} options={(Object.keys(TOPS) as (keyof typeof TOPS)[]).map((k) => ({ value: k, label: TOPS[k] }))} />
        </div>
        <div className="md:col-span-2">
          <span className={label}>What it shows</span>
          <Checks<Kind> value={s.kinds} onChange={(v) => v.length > 0 && set("kinds", v)} options={KINDS} />
          <p className="mt-2 font-mono text-[10.5px] leading-[1.8] text-ink-4">They take turns day by day, and no line repeats until its whole list has been used.</p>
        </div>
        <div className="md:col-span-2">
          <span className={label}>Along the bottom · up to 3</span>
          <Checks<FooterItem> value={s.footer} onChange={(v) => set("footer", v)} options={FOOTER} max={3} />
          {s.footer.includes("paidOut") && <p className="mt-2 font-mono text-[10.5px] text-ink">◆ Total paid out puts money on your Home Screen, where anyone holding your phone can see it.</p>}
        </div>
        <div>
          <span className={label}>Lock Screen widget</span>
          <Seg value={s.lock} onChange={(v) => set("lock", v)} options={(Object.keys(LOCKS) as (keyof typeof LOCKS)[]).map((k) => ({ value: k, label: LOCKS[k] }))} />
        </div>
        <div>
          <span className={label}>Refresh about every</span>
          <Seg value={String(s.refresh) as "15" | "30" | "60"} onChange={(v) => set("refresh", Number(v) as 15 | 30 | 60)} options={[{ value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "60", label: "Hour" }]} />
        </div>
        <SRow name="Show who said it" className="border-0 py-0">
          <Toggle checked={s.author} onChange={(v) => set("author", v)} label="Show who said it" />
        </SRow>
        <SRow name="Thin accent frame" className="border-0 py-0">
          <Toggle checked={s.border} onChange={(v) => set("border", v)} label="Thin accent frame" />
        </SRow>
      </div>

      <div className="mt-12 max-w-3xl">
        <SRow
          name="Widget key"
          hint={
            on
              ? `A widget key is active${lastUsed ? `, last read ${lastUsed}` : ""}. It can only read what the widget shows: never trades, accounts or broker logins.`
              : "Makes a private key the widget uses to read what it shows. Nothing else is reachable with it."
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
            <Note tone="pos">Key made. It&apos;s shown once: copy the script now. Making a new key turns the old one off.</Note>
            <ol className="list-decimal space-y-1.5 pl-5 font-mono text-[11px] leading-[1.8] text-ink-3">
              <li>Install Scriptable (free) from the App Store.</li>
              <li>In Scriptable open your Thunder script (or tap + for a new one), paste this over everything, and name it Thunder.</li>
              <li>Home Screen: long-press → + → Scriptable → pick a size → tap it → Script: Thunder.</li>
              <li>Lock Screen: long-press it → Customise → Lock Screen → add Scriptable → tap it → Script: Thunder.</li>
              <li>From now on, changes here reach the widget by themselves. No more pasting.</li>
            </ol>
            <Button onClick={copy}>{copied ? "Copied ◆" : "Copy the script"}</Button>
            <textarea readOnly value={code} rows={6} aria-label="Widget script" className="field w-full font-mono text-[10.5px] leading-[1.6]" onFocus={(e) => e.currentTarget.select()} />
          </div>
        )}
      </div>
    </div>
  );
}
