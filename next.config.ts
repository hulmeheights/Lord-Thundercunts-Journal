import type { NextConfig } from "next";

/**
 * Static security headers applied to every response.
 * The per-request Content-Security-Policy (with a nonce) is set in proxy.ts.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
  serverExternalPackages: ["postgres"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
