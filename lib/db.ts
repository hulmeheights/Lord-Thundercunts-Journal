import "server-only";
import postgres from "postgres";
import { env } from "./env";
import { MIGRATIONS } from "./migrations";

type Sql = postgres.Sql<Record<string, unknown>>;

const globalForDb = globalThis as unknown as {
  __ltjSql?: Sql;
  __ltjMigrated?: Promise<void> | null;
};

function createClient(): Sql {
  const url = env.databaseUrl;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    // Pooled serverless endpoints (Neon/Supabase pgbouncer) don't support
    // named prepared statements across connections.
    prepare: false,
    ssl: local ? false : "require",
    onnotice: () => {},
  });
}

function getSql(): Sql {
  if (!globalForDb.__ltjSql) globalForDb.__ltjSql = createClient();
  return globalForDb.__ltjSql;
}

async function migrate(sql: Sql) {
  await sql.begin(async (tx) => {
    // Serialise concurrent cold starts so migrations run exactly once.
    await tx`select pg_advisory_xact_lock(7271999)`;
    await tx`create table if not exists schema_migrations (version int primary key, applied_at timestamptz not null default now())`;
    const rows = await tx<{ version: number }[]>`select version from schema_migrations`;
    const applied = new Set(rows.map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      await tx.unsafe(m.sql);
      await tx`insert into schema_migrations (version) values (${m.version})`;
    }
  });
}

/** Returns a ready-to-use SQL client, running pending migrations on first use. */
export async function db(): Promise<Sql> {
  const sql = getSql();
  if (!globalForDb.__ltjMigrated) {
    globalForDb.__ltjMigrated = migrate(sql).catch((err) => {
      globalForDb.__ltjMigrated = null;
      throw err;
    });
  }
  await globalForDb.__ltjMigrated;
  return sql;
}
