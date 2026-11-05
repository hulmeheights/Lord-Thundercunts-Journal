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
  {
    version: 14,
    sql: /* sql */ `
      -- Goals and the steps taken towards them. Every step and every goal reached grows the tree.
      create table if not exists goals (
        id text primary key,
        title text not null check (char_length(title) between 1 and 160),
        why text check (why is null or char_length(why) <= 1000),
        target_day text check (target_day is null or target_day ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        created_at timestamptz not null default now(),
        completed_at timestamptz
      );
      create table if not exists goal_steps (
        id text primary key,
        goal_id text not null references goals (id) on delete cascade,
        day text not null check (day ~ '^\\d{4}-\\d{2}-\\d{2}$'),
        text text not null check (char_length(text) between 1 and 500),
        created_at timestamptz not null default now()
      );
      create index if not exists goal_steps_goal_idx on goal_steps (goal_id, created_at);
    `,
  },
  {
    version: 15,
    sql: /* sql */ `
      -- What you earn for reaching a goal, and when you actually took it.
      alter table goals add column if not exists reward text check (reward is null or char_length(reward) <= 160);
      alter table goals add column if not exists reward_claimed_at timestamptz;
    `,
  },
  {
    version: 16,
    sql: /* sql */ `
      -- Trading goals and life goals. A trading goal can count itself: it's reached
      -- after N clean trading days (inside your window, within your stops).
      alter table goals add column if not exists kind text not null default 'life' check (kind in ('trading', 'life'));
      alter table goals add column if not exists auto_clean_days int check (auto_clean_days is null or auto_clean_days between 1 and 365);
    `,
  },
  {
    version: 17,
    sql: /* sql */ `
      -- Phones and browsers that get push notifications. The subscription (its
      -- endpoint and keys) is AES-256-GCM encrypted; id is a hash of the endpoint.
      create table if not exists push_subscriptions (
        id text primary key,
        sub_enc text not null,
        device text check (device is null or char_length(device) <= 120),
        created_at timestamptz not null default now(),
        last_sent_at timestamptz
      );
      -- One reminder of each kind a day, however many times the cron fires.
      create table if not exists push_log (
        day text not null,
        kind text not null,
        sent_at timestamptz not null default now(),
        primary key (day, kind)
      );
    `,
  },
  {
    version: 18,
    sql: /* sql */ `
      -- How a trading goal measures itself (rules kept for a stretch, a number,
      -- or a rate), and the day it started counting (moved by "Start again").
      alter table goals add column if not exists measure jsonb;
      alter table goals add column if not exists started_on text check (started_on is null or started_on ~ '^\\d{4}-\\d{2}-\\d{2}$');
    `,
  },
  {
    version: 19,
    sql: /* sql */ `
      -- The phone widget's read-only key. Only a SHA-256 of it is stored; it
      -- can read today's quote, window and streak, nothing else.
      create table if not exists widget_tokens (
        token_hash text primary key,
        created_at timestamptz not null default now(),
        last_used_at timestamptz
      );
    `,
  },
  {
    version: 20,
    sql: /* sql */ `
      -- Your grade for each trade, A+ to F: the setup and the decision, not the P&L.
      alter table trades add column if not exists grade text check (grade in ('A+', 'A', 'B', 'C', 'F'));
    `,
  },
  {
    version: 21,
    sql: /* sql */ `
      -- A goal you gave up on stays in your history, marked failed.
      alter table goals add column if not exists failed_at timestamptz;
    `,
  },
  {
    version: 22,
    sql: /* sql */ `
      -- Each CSV import is remembered, so one can be undone later.
      create table if not exists imports (
        id text primary key,
        created_at timestamptz not null default now(),
        file_name text,
        label text
      );
      alter table trades add column if not exists import_id text;
      alter table fills add column if not exists import_id text;
      create index if not exists trades_import_idx on trades (import_id);
      create index if not exists fills_import_idx on fills (import_id);
      -- Imports from before this was tracked: trades that landed within a few
      -- minutes of each other came in the same import.
      with t as (
        select id, created_at,
          case when lag(created_at) over (order by created_at) is null
                 or created_at - lag(created_at) over (order by created_at) > interval '5 minutes' then 1 else 0 end as brk
        from trades where source = 'import' and import_id is null
      ),
      g as (select id, created_at, sum(brk) over (order by created_at rows unbounded preceding) as grp from t),
      ins as (
        insert into imports (id, created_at, label)
        select 'imp_old_' || grp, min(created_at), 'Earlier import' from g group by grp
        on conflict (id) do nothing
        returning id
      )
      update trades tr set import_id = 'imp_old_' || g.grp from g where tr.id = g.id;
    `,
  },
  {
    version: 23,
    sql: /* sql */ `
      -- Autopilot: the TradingView → TopstepX bot. One settings row (off /
      -- paper / live), the accounts it mirrors to, every signal it heard
      -- (also its duplicate guard), what it did per account, and a log.
      create table if not exists bot_settings (
        id int primary key default 1 check (id = 1),
        mode text not null default 'off' check (mode in ('off', 'paper', 'live')),
        updated_at timestamptz not null default now()
      );
      insert into bot_settings (id) values (1) on conflict (id) do nothing;
      create table if not exists bot_accounts (
        id text primary key,
        label text not null check (char_length(label) between 1 and 60),
        topstep_account text,
        contracts int not null default 5 check (contracts between 1 and 50),
        max_daily_loss double precision not null default 500 check (max_daily_loss > 0),
        max_daily_win double precision check (max_daily_win is null or max_daily_win > 0),
        enabled boolean not null default false,
        created_at timestamptz not null default now()
      );
      create table if not exists bot_signals (
        id text primary key,
        event text not null,
        dir text,
        price double precision,
        stop double precision,
        target double precision,
        session text,
        mode text not null,
        received_at timestamptz not null default now()
      );
      create index if not exists bot_signals_at_idx on bot_signals (received_at desc);
      create table if not exists bot_trades (
        id text primary key,
        signal_id text references bot_signals (id) on delete set null,
        account_id text references bot_accounts (id) on delete set null,
        account_label text not null,
        mode text not null check (mode in ('paper', 'live')),
        session text not null,
        dir text not null check (dir in ('LONG', 'SHORT')),
        qty int not null,
        entry_price double precision not null,
        stop_price double precision not null,
        target_price double precision not null,
        exit_price double precision,
        pnl double precision,
        status text not null check (status in ('open', 'closed', 'skipped', 'error')),
        reason text,
        order_id text,
        entered_at timestamptz not null default now(),
        exited_at timestamptz
      );
      create index if not exists bot_trades_at_idx on bot_trades (entered_at desc);
      create table if not exists bot_events (
        id bigserial primary key,
        level text not null,
        message text not null,
        created_at timestamptz not null default now()
      );
    `,
  },
  {
    version: 24,
    sql: /* sql */ `
      -- Autopilot: an account profit target per card. Once the account's
      -- balance is that far above its start, the card switches itself off.
      alter table bot_accounts add column if not exists profit_target double precision check (profit_target is null or profit_target > 0);
      alter table bot_accounts add column if not exists start_balance double precision not null default 50000 check (start_balance > 0);
      alter table bot_accounts add column if not exists last_balance double precision;
      alter table bot_accounts add column if not exists balance_at timestamptz;
      alter table bot_accounts add column if not exists passed_at timestamptz;
    `,
  },
  {
    version: 25,
    sql: /* sql */ `
      -- When the TradingView alert behind Autopilot expires, for the reminders.
      alter table bot_settings add column if not exists alert_expires text check (alert_expires is null or alert_expires ~ '^\\d{4}-\\d{2}-\\d{2}$');
    `,
  },
  {
    version: 26,
    sql: /* sql */ `
      -- Autopilot's news blackout: this week's high-impact US releases, and how wide the window is.
      create table if not exists bot_news (
        at timestamptz not null,
        title text not null,
        fetched_at timestamptz not null default now(),
        primary key (at, title)
      );
      alter table bot_settings add column if not exists news_minutes int not null default 11 check (news_minutes between 0 and 120);
    `,
  },
  {
    version: 27,
    sql: /* sql */ `
      -- Autopilot's home runner: Topstep wants orders to come from your own
      -- computer, so the website writes order tickets and a small program on
      -- your Mac places them and reports back. Tickets older than 20 seconds
      -- are never placed.
      create table if not exists bot_orders (
        id text primary key,
        trade_id text not null references bot_trades (id) on delete cascade,
        account_label text not null,
        topstep_account_id bigint not null,
        contract_id text not null,
        dir text not null check (dir in ('LONG', 'SHORT')),
        size int not null check (size between 1 and 50),
        stop_ticks int not null check (stop_ticks > 0),
        target_ticks int not null check (target_ticks > 0),
        tag text not null,
        status text not null default 'pending' check (status in ('pending', 'claimed', 'placed', 'failed', 'expired')),
        order_id text,
        error text,
        created_at timestamptz not null default now(),
        claimed_at timestamptz,
        done_at timestamptz
      );
      create index if not exists bot_orders_pending_idx on bot_orders (status, created_at);
      create table if not exists bot_runner (
        id int primary key default 1 check (id = 1),
        token_hash text,
        last_seen timestamptz,
        info text
      );
      insert into bot_runner (id) values (1) on conflict (id) do nothing;
      alter table bot_trades drop constraint if exists bot_trades_status_check;
      alter table bot_trades add constraint bot_trades_status_check check (status in ('pending', 'open', 'closed', 'skipped', 'error'));
    `,
  },
  {
    version: 28,
    sql: /* sql */ `
      -- Some firms (Topstep) restrict trading around big news, others don't: each card says whether the blackout applies.
      alter table bot_accounts add column if not exists news_rule boolean not null default true;
    `,
  },
  {
    version: 29,
    sql: /* sql */ `
      -- Autopilot, bot-on-your-Mac: the journal only hands live alerts to the
      -- Mac (which decides and places) and keeps what the Mac reports.
      alter table bot_signals add column if not exists handoff text check (handoff is null or handoff in ('waiting', 'claimed', 'done', 'missed'));
      alter table bot_signals add column if not exists claimed_at timestamptz;
      create index if not exists bot_signals_handoff_idx on bot_signals (handoff, received_at);
      alter table bot_runner add column if not exists accounts jsonb;
      alter table bot_runner add column if not exists accounts_at timestamptz;
      alter table bot_settings add column if not exists balances_due timestamptz;
    `,
  },
  {
    version: 30,
    sql: /* sql */ `
      -- Track record: imported TradingView and TopstepX trade lists, kept for good (repeats ignored).
      create table if not exists bot_history (
        id text primary key,
        source text not null check (source in ('tv', 'topstep')),
        import_id text,
        account text,
        symbol text,
        dir text not null check (dir in ('LONG', 'SHORT')),
        qty float8 not null default 1,
        entry_at timestamptz not null,
        exit_at timestamptz,
        entry_price float8,
        exit_price float8,
        pnl float8 not null,
        session text not null,
        signal text,
        created_at timestamptz not null default now()
      );
      create index if not exists bot_history_source_idx on bot_history (source, entry_at);
      create table if not exists bot_history_imports (
        id text primary key,
        source text not null,
        file_name text,
        account text,
        rows int not null default 0,
        added int not null default 0,
        created_at timestamptz not null default now()
      );
    `,
  },
  {
    version: 31,
    sql: /* sql */ `
      -- One-off, asked for: the letter opening 25 Jan 2027 counts its $10,000 goal as money paid out, not net P&L.
      update capsules c set goals = (
        select jsonb_agg(case when g->>'kind' = 'net' and (g->>'target')::numeric = 10000 then jsonb_set(g, '{kind}', '"paidOut"') else g end order by i)
        from jsonb_array_elements(c.goals) with ordinality as x(g, i)
      )
      where c.deliver_on::text = '2027-01-25' and c.opened_at is null and c.goals @> '[{"kind": "net", "target": 10000}]';
    `,
  },
  {
    version: 32,
    sql: /* sql */ `
      -- One-off fix: two UK-dated exports imported on 2 Nov 2026 were read as 11 Feb. Swap day and month back
      -- (both dates are on GMT, so the swap is exact) for those imports' February trades only.
      update trades t set
        entry_time = t.entry_time + (make_date(extract(year from t.entry_time at time zone 'UTC')::int, extract(day from t.entry_time at time zone 'UTC')::int, extract(month from t.entry_time at time zone 'UTC')::int) - (t.entry_time at time zone 'UTC')::date) * interval '1 day',
        exit_time = t.exit_time + (make_date(extract(year from t.exit_time at time zone 'UTC')::int, extract(day from t.exit_time at time zone 'UTC')::int, extract(month from t.exit_time at time zone 'UTC')::int) - (t.exit_time at time zone 'UTC')::date) * interval '1 day'
      where t.source = 'import'
        and t.import_id in (select id from imports where created_at >= '2026-11-02' and created_at < '2026-11-03')
        and t.entry_time >= '2026-02-01' and t.entry_time < '2026-03-01'
        and extract(day from t.entry_time at time zone 'UTC') <= 12
        and extract(day from t.exit_time at time zone 'UTC') <= 12;
    `,
  },
  {
    version: 33,
    sql: /* sql */ `
      -- Autopilot keeps its own eval ledger (evals, passes, payouts), apart from Guardian's.
      alter table prop_ledger add column if not exists book text not null default 'manual';
      alter table prop_ledger drop constraint if exists prop_ledger_book_check;
      alter table prop_ledger add constraint prop_ledger_book_check check (book in ('manual', 'autopilot'));
    `,
  },
  {
    version: 34,
    sql: /* sql */ `
      -- One-off repair: imported trades whose day and month were read the wrong way round. A trade is moved only
      -- when the swapped date is within 2 days of its import and the stored one is weeks away from it.
      with bad as (
        select t.id from trades t join imports i on i.id = t.import_id
        where t.source = 'import' and i.created_at >= '2026-11-01'
          and extract(day from t.entry_time at time zone 'UTC') <= 12 and extract(day from t.exit_time at time zone 'UTC') <= 12
          and abs((t.entry_time at time zone 'UTC')::date - (i.created_at at time zone 'UTC')::date) > 20
          and abs(make_date(extract(year from t.entry_time at time zone 'UTC')::int, extract(day from t.entry_time at time zone 'UTC')::int, extract(month from t.entry_time at time zone 'UTC')::int) - (i.created_at at time zone 'UTC')::date) <= 2
      )
      update trades t set
        entry_time = t.entry_time + (make_date(extract(year from t.entry_time at time zone 'UTC')::int, extract(day from t.entry_time at time zone 'UTC')::int, extract(month from t.entry_time at time zone 'UTC')::int) - (t.entry_time at time zone 'UTC')::date) * interval '1 day',
        exit_time = t.exit_time + (make_date(extract(year from t.exit_time at time zone 'UTC')::int, extract(day from t.exit_time at time zone 'UTC')::int, extract(month from t.exit_time at time zone 'UTC')::int) - (t.exit_time at time zone 'UTC')::date) * interval '1 day'
      from bad where t.id = bad.id;
    `,
  },
  {
    version: 35,
    sql: /* sql */ `
      -- Script B: each card is an eval (Combine) or funded (Express) account; funded skips quiet-market trades.
      alter table bot_accounts add column if not exists phase text not null default 'eval';
      alter table bot_accounts drop constraint if exists bot_accounts_phase_check;
      alter table bot_accounts add constraint bot_accounts_phase_check check (phase in ('eval', 'funded'));
      alter table bot_signals add column if not exists alert_mode text;
      alter table bot_signals add column if not exists quiet boolean;
    `,
  },
  {
    version: 36,
    sql: /* sql */ `
      -- MNQ SOR v2: one alert sends every possible trade; each card decides with its own rules.
      alter table bot_accounts add column if not exists dry_run boolean not null default true;
      alter table bot_accounts add column if not exists rules jsonb not null default '{}';
      -- Every signal kept as it came (never the secret), for the dry-run check and replays.
      alter table bot_signals add column if not exists tv_id text;
      alter table bot_signals add column if not exists payload jsonb;
      create unique index if not exists bot_signals_tv_id_idx on bot_signals (tv_id) where tv_id is not null;
      -- The ledger, per account: dry runs are their own book; the step a skip failed at; how each trade ended.
      alter table bot_trades drop constraint if exists bot_trades_mode_check;
      alter table bot_trades add constraint bot_trades_mode_check check (mode in ('paper', 'live', 'dry'));
      alter table bot_trades add column if not exists tv_id text;
      alter table bot_trades add column if not exists swing text;
      alter table bot_trades add column if not exists phase text;
      alter table bot_trades add column if not exists quiet boolean;
      alter table bot_trades add column if not exists capped boolean;
      alter table bot_trades add column if not exists step int;
      alter table bot_trades add column if not exists bar_time timestamptz;
      alter table bot_trades add column if not exists exit_reason text;
      alter table bot_trades add column if not exists fees float8;
      create index if not exists bot_trades_account_idx on bot_trades (account_id, mode, entered_at);
      alter table bot_trades alter column target_price drop not null;
    `,
  },
];
