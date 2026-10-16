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
    color: "#74b89c",
    blurb: "Free auto-sync, no login or API key. Uses TopstepX's own Share link for each account.",
    steps: [
      "On a computer, open TopstepX → Performance stats for the account → Share, and copy the link.",
      "Repeat for each Combine / Express Funded account you want tracked.",
      "Paste all the links below (one per line). Anyone with a link can view that account's stats, so only share it with yourself.",
    ],
  },
  {
    id: "topstep",
    name: "TopstepX — API key",
    kind: "projectx",
    host: "https://api.topstepx.com",
    color: "#bd9e63",
    blurb: "The same TopstepX username and API key Tradecopia asks for. New accounts appear by themselves.",
    steps: [
      "TopstepX → Settings → API. If you already linked Tradecopia, the key is there: copy it, or click “Add API Key” for a fresh one.",
      "No key yet? It comes with ProjectX API access (dashboard.projectx.com, code “topstep”). Already paying for it for Tradecopia? Then this costs nothing extra.",
      "Enter your TopstepX username (not your email) and the key below. It's checked, then sealed with AES-256-GCM.",
    ],
  },
  {
    id: "tradovate",
    name: "Tradovate",
    kind: "tradovate",
    color: "#a8a39a",
    blurb: "Advanced: your own CID and secret from Tradovate's API add-on (funded live accounts only). For prop accounts use Log in with Tradovate.",
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
