import "server-only";

/**
 * All secrets live in environment variables (Vercel → Project → Settings →
 * Environment Variables, marked "Sensitive"). Nothing secret is ever committed
 * to the repository, so the source can be public without exposing anything.
 */

// libpq / ORM options that postgres.js would otherwise forward to the server as
// (invalid) startup parameters — e.g. Neon's `channel_binding=require`.
const STRIP_PARAMS = [
  "channel_binding", "sslrootcert", "sslcert", "sslkey", "sslcrl", "sslpassword", "gssencmode", "krbsrvname",
  "requiressl", "pgbouncer", "schema", "connection_limit", "pool_timeout", "statement_cache_size", "socket_timeout",
];

function sanitizeDatabaseUrl(raw: string): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    for (const p of STRIP_PARAMS) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return raw;
  }
}

export const env = {
  get databaseUrl() {
    return sanitizeDatabaseUrl(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
  },
  /** Legacy: a passphrase set as an env var. New installs set it in-app instead. */
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
      label: "Free database",
      ok: env.databaseUrl.length > 0,
      required: true,
      help: "Vercel → your project → Storage → Create Database → Neon → Free → Connect. Vercel adds DATABASE_URL for you.",
    },
    {
      key: "ENCRYPTION_KEY",
      label: "Encryption key",
      ok: env.encryptionKey.length >= 32,
      required: true,
      help: "Encrypts your broker logins. Generated below in your browser — paste the block into Vercel.",
    },
    {
      key: "CRON_SECRET",
      label: "Nightly auto-sync",
      ok: env.cronSecret.length >= 16,
      required: false,
      help: "Included in the block below. Lets Vercel sync your trades every evening.",
    },
    {
      key: "ANTHROPIC_API_KEY",
      label: "AI coach (optional, paid per use)",
      ok: env.anthropicKey.length > 0,
      required: false,
      help: "From console.anthropic.com. Powers AI briefings and the coach — everything else works without it.",
    },
  ];
}

export function isConfigured(): boolean {
  return setupChecklist().every((i) => !i.required || i.ok);
}

export function aiConfigured(): boolean {
  return env.anthropicKey.length > 0;
}
