"use client";

import { DEFAULT_UI, parseUiPrefs, serializeUiPrefs, UI_COOKIE, type UiPrefs } from "./ui-prefs";

export function readUiPrefs(): UiPrefs {
  if (typeof document === "undefined") return DEFAULT_UI;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${UI_COOKIE}=`))?.slice(UI_COOKIE.length + 1);
  return parseUiPrefs(raw);
}

/** Saves appearance prefs (one-year cookie) and applies them to <html> immediately. */
export function writeUiPrefs(patch: Partial<UiPrefs>): UiPrefs {
  const next = { ...readUiPrefs(), ...patch };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${UI_COOKIE}=${encodeURIComponent(serializeUiPrefs(next))}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  const root = document.documentElement;
  root.dataset.theme = next.theme;
  root.dataset.loss = next.loss;
  const meta = document.querySelector('meta[name="theme-color"]');
  const night = next.theme === "night" || (next.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  meta?.setAttribute("content", night ? "#07110c" : "#fafaf7");
  return next;
}
