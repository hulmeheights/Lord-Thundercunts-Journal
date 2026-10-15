/** Appearance preferences live in a plain cookie so the first paint is already right. Not secret. */
export type ThemePref = "paper" | "night" | "auto";
export type LossPref = "mono" | "red";
export type UiPrefs = { theme: ThemePref; loss: LossPref; sound: boolean; intro: boolean };

export const UI_COOKIE = "ltj_ui";
export const DEFAULT_UI: UiPrefs = { theme: "paper", loss: "mono", sound: false, intro: true };

export function parseUiPrefs(raw: string | undefined | null): UiPrefs {
  const out = { ...DEFAULT_UI };
  if (!raw) return out;
  for (const part of decodeURIComponent(raw).split(".")) {
    const [k, v] = part.split(":");
    if (k === "t" && (v === "paper" || v === "night" || v === "auto")) out.theme = v;
    if (k === "l" && (v === "mono" || v === "red")) out.loss = v;
    if (k === "s") out.sound = v === "1";
    if (k === "i") out.intro = v !== "0";
  }
  return out;
}

export function serializeUiPrefs(p: UiPrefs): string {
  return `t:${p.theme}.l:${p.loss}.s:${p.sound ? 1 : 0}.i:${p.intro ? 1 : 0}`;
}
