/**
 * How the phone widget looks: saved in Settings, sent with every feed, and
 * drawn the same way by the Scriptable script and the preview in Settings.
 */
import { z } from "zod";

export const THEMES = {
  night: { label: "Night", bg: "#0a0a0b", ink: "#ece7dd", dim: "#8f8a80" },
  black: { label: "True black", bg: "#000000", ink: "#f4f1ea", dim: "#86827a" },
  paper: { label: "Paper", bg: "#f3efe6", ink: "#1c1a17", dim: "#7a746a" },
  navy: { label: "Midnight", bg: "#0d1424", ink: "#e8ecf4", dim: "#8a93a6" },
  forest: { label: "Forest", bg: "#0e1712", ink: "#e6ede7", dim: "#86978b" },
  wine: { label: "Wine", bg: "#1a0d10", ink: "#f1e6e8", dim: "#9c8589" },
} as const;

export const ACCENTS = {
  gold: { label: "Gold", hex: "#bd9e63" },
  jade: { label: "Jade", hex: "#6fb59a" },
  cream: { label: "Cream", hex: "#ece7dd" },
  rose: { label: "Rose", hex: "#d49a9a" },
  sky: { label: "Sky", hex: "#8fb3d9" },
  violet: { label: "Violet", hex: "#a99ad9" },
} as const;

export const FONTS = {
  serif: { label: "Serif", css: "Georgia, 'Times New Roman', serif" },
  sans: { label: "Clean", css: "-apple-system, system-ui, 'Helvetica Neue', sans-serif" },
  rounded: { label: "Rounded", css: "ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif" },
  mono: { label: "Typewriter", css: "ui-monospace, 'SF Mono', Menlo, monospace" },
} as const;

export const KINDS = { prayer: "Prayers", quote: "Quotes", thankful: "Thankful", manifest: "Manifest" } as const;
export const FOOTER = {
  window: "Your window",
  streak: "Clean-day streak",
  mission: "Mission name",
  funded: "Funded accounts live",
  payouts: "Payouts so far",
  paidOut: "Total paid out ($)",
} as const;
/** The bottom-right corner, in italics: one item, your own words, or nothing. */
export const CORNERS = {
  mission: "Mission name",
  custom: "My own words",
  streak: "Clean-day streak",
  window: "Your window",
  funded: "Funded accounts",
  payouts: "Payouts so far",
  paidOut: "Total paid out ($)",
  none: "Nothing",
} as const;
export const TOPS = { status: "Window status", date: "Today's date", mission: "Mission name", none: "Nothing" } as const;
export const LOCKS = { words: "The words only", "status-words": "Window status + words", streak: "Streak and status" } as const;

export type Kind = keyof typeof KINDS;
export type FooterItem = keyof typeof FOOTER;

export const WidgetStyle = z.object({
  theme: z.enum(Object.keys(THEMES) as [keyof typeof THEMES]),
  accent: z.enum(Object.keys(ACCENTS) as [keyof typeof ACCENTS]),
  font: z.enum(Object.keys(FONTS) as [keyof typeof FONTS]),
  size: z.enum(["s", "m", "l"]),
  align: z.enum(["left", "center"]),
  top: z.enum(Object.keys(TOPS) as [keyof typeof TOPS]),
  author: z.boolean(),
  border: z.boolean(),
  kinds: z.array(z.enum(Object.keys(KINDS) as [Kind])).min(1, "Pick at least one kind of message"),
  footer: z.array(z.enum(Object.keys(FOOTER) as [FooterItem])).max(3, "Up to three things fit along the bottom"),
  lock: z.enum(Object.keys(LOCKS) as [keyof typeof LOCKS]),
  corner: z.enum(Object.keys(CORNERS) as [keyof typeof CORNERS]),
  cornerText: z.string().max(40, "Keep the corner to 40 characters").transform((t) => t.replace(/[\u0000-\u001f\u007f]/g, "").trim()),
  refresh: z.union([z.literal(15), z.literal(30), z.literal(60)]),
});
export type WidgetStyle = z.infer<typeof WidgetStyle>;

export const DEFAULT_WIDGET: WidgetStyle = {
  theme: "night",
  accent: "gold",
  font: "serif",
  size: "m",
  align: "left",
  top: "status",
  author: true,
  border: false,
  kinds: ["prayer", "quote", "thankful", "manifest"],
  footer: ["window", "streak"],
  lock: "words",
  corner: "mission",
  cornerText: "",
  refresh: 15,
};

/** Quote text size per widget size, scaled by the size setting. */
export function quoteSize(family: "small" | "medium" | "large", size: WidgetStyle["size"]): number {
  const base = family === "small" ? 13 : family === "large" ? 19 : 15;
  return Math.round(base * (size === "s" ? 0.87 : size === "l" ? 1.15 : 1));
}
/** How many lines the quote may take before it's cut. */
export const quoteLines = (family: "small" | "medium" | "large") => (family === "small" ? 5 : family === "large" ? 10 : 4);
