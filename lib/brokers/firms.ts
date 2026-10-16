/** Prop firms and platforms the journal can read from. Client-safe. */

export type PlatformKind = "projectx" | "tradovate" | "share" | "ntmcp";

export type Firm = {
  id: string;
  name: string;
  kind: PlatformKind;
  /** ProjectX Gateway base URL (projectx only). */
  host?: string;
  color: string;
  blurb: string;
  steps: string[];
};

export const FIRMS: Firm[] = [
  {
    id: "topstep-share",
    name: "TopstepX — free",
    kind: "share",
    color: "#30d158",
    blurb: "Free auto-sync, no login or API key. Uses TopstepX's own Share link for each account.",
    steps: [
      "On a computer, open TopstepX → Performance stats for the account → Share, and copy the link.",
      "Repeat for each Combine / Express Funded account you want tracked.",
      "Paste all the links below (one per line). Anyone with a link can view that account's stats, so only share it with yourself.",
    ],
  },
  {
    id: "topstep",
    name: "TopstepX — API",
    kind: "projectx",
    host: "https://api.topstepx.com",
    color: "#64d2ff",
    blurb: "Official API ($14.50/mo with code “topstep”). Picks up new accounts automatically, no sharing needed.",
    steps: [
      "Subscribe to ProjectX API Access at dashboard.projectx.com (code “topstep” = 50% off).",
      "In TopstepX → Settings → API, click “Add Link”, then “Add API Key”.",
      "Enter your TopstepX username (not your email) and the API key below.",
    ],
  },
  {
    id: "tradovate",
    name: "Tradovate",
    kind: "tradovate",
    color: "#ff9f0a",
    blurb: "Needs Tradovate's paid API add-on on a funded live account — most prop accounts can't use it. Use free Import instead.",
    steps: [
      "In Tradovate → Application Settings → Add-Ons, enable API Access (requires a funded live account).",
      "API Access tab → Generate API Key. Copy the CID and Secret.",
      "Enter your Tradovate username, password, CID and Secret below.",
    ],
  },
];

export function firmById(id: string | null | undefined): Firm | undefined {
  return FIRMS.find((f) => f.id === id);
}

/** Human label for a trade's source / connection id. */
export function sourceLabel(source: string, connectionLabels: Record<string, string> = {}): string {
  if (connectionLabels[source]) return connectionLabels[source]!;
  if (source === "sample") return "Sample";
  if (source === "manual") return "Manual";
  if (source === "import") return "Imported";
  if (source === "topstepx") return "TopstepX";
  if (source === "topstepx-share") return "TopstepX";
  if (source.startsWith("tradovate") || source.startsWith("ntmcp")) return "Tradovate";
  if (source.startsWith("projectx-")) {
    const firm = firmById(source.slice(9));
    return firm ? firm.name : "ProjectX";
  }
  return source;
}
