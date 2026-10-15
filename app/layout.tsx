import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Every page is private, per-user and served with a per-request CSP nonce, so
// nothing is ever prerendered at build time (builds never touch the database).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Lord Thundercunts Journal", template: "%s · Thundercunts" },
  description: "A private, AI-powered trading journal.",
  applicationName: "Lord Thundercunts Journal",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: "Thundercunts", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
