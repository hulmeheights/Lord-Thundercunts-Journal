import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { parseUiPrefs, UI_COOKIE } from "@/lib/ui-prefs";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { MagneticLayer } from "@/components/motion/Magnetic";
import { RevealObserver } from "@/components/m/RevealObserver";
import "./globals.css";

// Every page is private, per-user and served with a per-request CSP nonce, so
// nothing is ever prerendered at build time (builds never touch the database).
export const dynamic = "force-dynamic";

const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});
const serif = localFont({
  src: [
    { path: "../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2", style: "normal" },
    { path: "../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2", style: "italic" },
  ],
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
});
const mono = localFont({
  src: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jbm",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Lord Thundercunts Journal", template: "%s · Thundercunts" },
  description: "A private, AI-powered trading journal.",
  applicationName: "Lord Thundercunts Journal",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: "Thundercunts", statusBarStyle: "default" },
};

// One theme: the warm void.
export const viewport: Viewport = { themeColor: "#0a0a0b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const prefs = parseUiPrefs((await cookies()).get(UI_COOKIE)?.value);
  return (
    <html lang="en" data-theme={prefs.theme} data-loss={prefs.loss} className={`${inter.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <SmoothScroll />
        <MagneticLayer />
        <RevealObserver />
        {children}
        <div aria-hidden className="grain" />
      </body>
    </html>
  );
}
