/**
 * Idempotent, append-only schema migrations. Never edit an applied migration —
 * add a new one with the next version number instead.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: /* sql */ `
      create table if not exists sessions (
        id text primary key,
        created_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now(),
        expires_at timestamptz not null,
        user_agent text,
        method text not null default 'passphrase'
      );

      create table if not exists auth_attempts (
        id bigserial primary key,
        ip_hash text not null,
        success boolean not null,
        created_at timestamptz not null default now()
      );
      create index if not exists auth_attempts_created_idx on auth_attempts (created_at);
      create index if not exists auth_attempts_ip_idx on auth_attempts (ip_hash, created_at);

      create table if not exists passkeys (
        id text primary key,
        public_key text not null,
        counter double precision not null default 0,
        transports text[] not null default '{}',
        name text not null,
        created_at timestamptz not null default now(),
        last_used_at timestamptz
      );

      create table if not exists webauthn_challenges (
        id text primary key,
        challenge text not null,
        purpose text not null,
        expires_at timestamptz not null
      );

      create table if not exists app_settings (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      );

      create table if not exists connections (
        provider text primary key,
        label text not null,
        username_hint text,
        environment text not null default 'live',
        credentials_enc text not null,
        token_enc text,
        token_expires_at timestamptz,
        status text not null default 'connected',
        last_sync_at timestamptz,
        last_error text,
        syncing_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists broker_accounts (
        id text primary key,
        provider text not null,
        external_id text not null,
        name text not null,
        is_sim boolean not null default false,
        balance double precision,
        active boolean not null default true,
        included boolean not null default true,
        updated_at timestamptz not null default now()
      );

      create table if not exists fills (
        id text primary key,
        provider text not null,
        account_id text not null,
        contract_id text not null,
        symbol text not null,
        side text not null check (side in ('buy', 'sell')),
        qty double precision not null,
        price double precision not null,
        ts timestamptz not null,
        fees double precision not null default 0,
        broker_pnl double precision,
        point_value double precision not null
      );
      create index if not exists fills_account_ts_idx on fills (account_id, ts);

      create table if not exists trades (
        id text primary key,
        source text not null,
        account_id text,
        symbol text not null,
        root text not null,
        direction text not null check (direction in ('long', 'short')),
        qty double precision not null,
        max_position double precision,
        entry_time timestamptz not null,
        exit_time timestamptz not null,
        entry_price double precision not null,
        exit_price double precision not null,
        gross_pnl double precision not null,
        fees double precision not null default 0,
        net_pnl double precision not null,
        point_value double precision not null,
        fill_count int not null default 2,
        setup text,
        tags text[] not null default '{}',
        mistakes text[] not null default '{}',
        emotion text,
        rating int,
        notes text,
        planned_risk double precision,
        followed_plan boolean,
        chart_url text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists trades_exit_idx on trades (exit_time desc);
      create index if not exists trades_source_idx on trades (source);

      create table if not exists journal_days (
        day text primary key check (day ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        checklist jsonb not null default '{}',
        tasks jsonb not null default '[]',
        readiness jsonb,
        intention text,
        plan text,
        review text,
        wins text,
        lessons text,
        mood_after int,
        rules_kept jsonb not null default '{}',
        is_sample boolean not null default false,
        updated_at timestamptz not null default now()
      );

      create table if not exists briefings (
        id text primary key,
        input_hash text not null,
        content jsonb not null,
        model text,
        created_at timestamptz not null default now()
      );

      create table if not exists capsules (
        id text primary key,
        message text not null,
        created_at timestamptz not null default now(),
        deliver_on text not null,
        opened_at timestamptz
      );
    `,
  },
];
