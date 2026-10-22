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
  {
    version: 2,
    sql: /* sql */ `
      -- The owner's passphrase, set in-app on first launch (scrypt hash, never plain text).
      create table if not exists owner (
        id int primary key default 1 check (id = 1),
        passphrase_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `,
  },
  {
    version: 3,
    sql: /* sql */ `
      -- Several connections per platform (e.g. TopstepX + Lucid + Tradeify on ProjectX).
      alter table connections add column if not exists id text;
      alter table connections add column if not exists firm text;
      update connections set id = provider where id is null;
      update connections set firm = 'topstep' where firm is null and provider = 'topstepx';
      update connections set provider = 'projectx' where provider = 'topstepx';
      alter table connections alter column id set not null;
      alter table connections drop constraint if exists connections_pkey;
      alter table connections add constraint connections_pkey primary key (id);
      create index if not exists trades_account_idx on trades (account_id);
    `,
  },
  {
    version: 4,
    sql: /* sql */ `
      -- The Observer: third-person self-reviews, with the evidence as it stood at the time.
      create table if not exists observer_sessions (
        id text primary key,
        created_at timestamptz not null default now(),
        day text not null,
        window_from text not null,
        window_to text not null,
        wants text,
        doing text,
        stopping text,
        advice text,
        believed text[] not null default '{}',
        snapshot jsonb not null,
        gap jsonb,
        ai jsonb,
        adopted text[] not null default '{}'
      );
      create index if not exists observer_sessions_created_idx on observer_sessions (created_at desc);
    `,
  },
  {
    version: 5,
    sql: /* sql */ `
      -- The eval ledger: what prop evaluations have cost, and what they've paid back.
      -- Amounts are always positive; the kind decides the direction.
      create table if not exists prop_ledger (
        id text primary key,
        day text not null check (day ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        firm text not null check (char_length(firm) between 1 and 60),
        account text check (account is null or char_length(account) <= 80),
        kind text not null check (kind in ('evaluation', 'reset', 'activation', 'subscription', 'payout', 'refund', 'other')),
        amount numeric(12, 2) not null check (amount >= 0),
        note text check (note is null or char_length(note) <= 280),
        created_at timestamptz not null default now()
      );
      create index if not exists prop_ledger_day_idx on prop_ledger (day desc);
    `,
  },
  {
    version: 6,
    sql: /* sql */ `
      -- Photos pinned to a journal day. The image bytes are AES-256-GCM encrypted
      -- (bound to the photo id), so a database leak alone shows nothing.
      create table if not exists journal_photos (
        id text primary key,
        day text not null check (day ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        caption text check (caption is null or char_length(caption) <= 280),
        mime text not null check (mime in ('image/webp', 'image/jpeg', 'image/png')),
        width int not null check (width between 1 and 8000),
        height int not null check (height between 1 and 8000),
        bytes int not null,
        data_enc bytea not null,
        created_at timestamptz not null default now()
      );
      create index if not exists journal_photos_day_idx on journal_photos (day, created_at);
    `,
  },
  {
    version: 7,
    sql: /* sql */ `
      -- Coach conversations, kept so they follow you across devices. Each one gets a
      -- short note (what was discussed, what you committed to); new chats read the
      -- recent notes, never the old transcripts. Deleting a chat deletes its note.
      create table if not exists coach_chats (
        id text primary key,
        title text not null default 'Conversation',
        messages jsonb not null default '[]',
        note text,
        commitments jsonb not null default '[]',
        noted_count int not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists coach_chats_updated_idx on coach_chats (updated_at desc);
    `,
  },
  {
    version: 8,
    sql: /* sql */ `
      -- A trade can carry more than one setup (e.g. FVG + VWAP). The old single
      -- setup is carried over; the old column stays so nothing is ever lost.
      alter table trades add column if not exists setups text[] not null default '{}';
      update trades set setups = array[setup] where setup is not null and cardinality(setups) = 0;

      -- Your setup list: VAL, VAH, POC, BOS, CHoCH, FVG, VWAP, EMA, Liquidity Sweep,
      -- Reversal, Continuation, Barcode. Replaces the old starter list.
      update app_settings
        set value = jsonb_set(value, '{setups}', '["VAL", "VAH", "POC", "BOS", "CHoCH", "FVG", "VWAP", "EMA", "Liquidity Sweep", "Reversal", "Continuation", "Barcode"]'::jsonb),
            updated_at = now()
        where key = 'vocab';
    `,
  },
  {
    version: 9,
    sql: /* sql */ `
      -- The ledger also keeps the scoreboard: evals passed, evals blown, funded
      -- accounts blown. Those lines carry a count and no money. qty lets five
      -- copied evals (or five payouts) be one line.
      alter table prop_ledger add column if not exists qty int not null default 1 check (qty between 1 and 100);
      alter table prop_ledger drop constraint if exists prop_ledger_kind_check;
      alter table prop_ledger add constraint prop_ledger_kind_check check (kind in (
        'evaluation', 'reset', 'activation', 'subscription', 'payout', 'refund', 'other', 'passed', 'blown', 'funded_blown'
      ));
    `,
  },
  {
    version: 10,
    sql: /* sql */ `
      -- Life outside the charts, per day: tags (family, health, poor sleep…) and a
      -- short note, so a bumpy patch can be read next to what was going on at home.
      alter table journal_days add column if not exists life_tags text[] not null default '{}';
      alter table journal_days add column if not exists life_note text check (life_note is null or char_length(life_note) <= 2000);
    `,
  },
  {
    version: 11,
    sql: /* sql */ `
      -- Every "Read it back to me" reflection, kept per day. The text is AES-256-GCM
      -- encrypted (bound to its id). basis_hash fingerprints the entry and trades it
      -- read, so a reflection can say when the page has changed since.
      create table if not exists journal_reflections (
        id text primary key,
        day text not null check (day ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        body_enc text not null,
        basis_hash text not null,
        created_at timestamptz not null default now()
      );
      create index if not exists journal_reflections_day_idx on journal_reflections (day, created_at desc);
    `,
  },
  {
    version: 12,
    sql: /* sql */ `
      -- The closing line on Insights and Guardian, written from your own numbers.
      -- hash fingerprints the facts it was written from, so it's rewritten only when they change.
      create table if not exists personal_lines (
        page text primary key check (page in ('insights', 'guardian')),
        hash text not null,
        line text not null check (char_length(line) <= 300),
        cite text not null check (char_length(cite) <= 80),
        created_at timestamptz not null default now()
      );
    `,
  },
  {
    version: 13,
    sql: /* sql */ `
      -- Goals sealed with a time capsule, checked against your trades and ledger when it opens.
      alter table capsules add column if not exists goals jsonb not null default '[]';
    `,
  },
];
