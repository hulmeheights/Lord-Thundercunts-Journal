import "server-only";

/**
 * All secrets live in environment variables (Vercel → Project → Settings →
 * Environment Variables, marked "Sensitive"). Nothing secret is ever committed
 * to the repository, so the source can be public without exposing anything.
 */
export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  },
  get ownerPassword() {
    return process.env.OWNER_PASSWORD || "";
  },
  get encryptionKey() {
    return process.env.ENCRYPTION_KEY || "";
  },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY || "";
  },
  get aiModel() {
    return process.env.AI_MODEL || "claude-opus-5-5";
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
};

export type SetupItem = {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  help: string;
};

export function setupChecklist(): SetupItem[] {
  return [
    {
      key: "DATABASE_URL",
      label: "Database",
      ok: env.databaseUrl.length > 0,
      required: true,
      help: "Vercel → Storage → Create Database → Neon (free). It auto-adds DATABASE_URL to the project.",
    },
    {
      key: "OWNER_PASSWORD",
      label: "Owner passphrase",
      ok: env.ownerPassword.length >= 12,
      required: true,
      help: "Your private unlock passphrase. At least 12 characters — a sentence works best.",
    },
    {
      key: "ENCRYPTION_KEY",
      label: "Encryption key",
      ok: env.encryptionKey.length >= 32,
      required: true,
      help: "32+ random characters. Encrypts your broker credentials at rest. Use the generator below.",
    },
    {
      key: "CRON_SECRET",
      label: "Nightly auto-sync",
      ok: env.cronSecret.length >= 16,
      required: false,
      help: "16+ random characters. Lets Vercel's nightly job sync your trades while you sleep.",
    },
    {
      key: "ANTHROPIC_API_KEY",
      label: "AI coach (Claude)",
      ok: env.anthropicKey.length > 0,
      required: false,
      help: "From console.anthropic.com → API Keys. Powers AI briefings, journal reflections and the coach.",
    },
  ];
}

export function isConfigured(): boolean {
  return setupChecklist().every((i) => !i.required || i.ok);
}

export function aiConfigured(): boolean {
  return env.anthropicKey.length > 0;
}
