# ⚡ Lord Thundercunts Journal

A private, AI-powered trading journal for futures traders. It feels like an Apple app, logs your trades
automatically from **TopstepX** and **Tradovate**, and briefs you every day, week and month as a swipeable slideshow.

---

## What makes it different

| Feature | What it does |
| --- | --- |
| **Briefings (Stories)** | Daily, weekly and monthly debriefs as full-screen slides: money made and lost, scoreboard, equity curve, best and worst trade, your edge, your leak, discipline, report card, prop status, AI coach verdict, and the *one thing* to fix next. They refresh as new trades sync. |
| **Trader Rings** | Three rings for what you control: **Prepare** (pre-market ritual + readiness + intention), **Discipline** (every trade inside your rules) and **Reflect** (review written). P&L is deliberately not a ring. Streaks reward process. |
| **Auto-enforced rules** | Max trades, daily loss, losing-streak stop, size, trading window and cool-down are checked against every synced trade. No self-reporting needed. |
| **Rule Lab (ghost curve)** | Replays your real trades under different rules ("stop after 2 losses", "done by 11:30", "skip Fridays") and draws the equity curve you *would* have had. It also suggests the rules that would have paid you most. |
| **Tilt Radar** | Detects revenge trading from behaviour alone: fast re-entries after a loss, sizing up, trading through a losing streak. It shows what tilt costs you in dollars. |
| **Prop Guardian** | Topstep-style rules tracked live: end-of-day trailing max loss, daily loss limit, consistency target and profit target. A **Monte Carlo** simulation of 4,000 futures built from your own days estimates your odds of passing or blowing the account. |
| **Mind ↔ Market** | A morning readiness check-in (sleep, energy, focus, mood), correlated with your P&L. It shows how much your state is worth in dollars. |
| **Report Card** | You're graded on Discipline, Risk, Edge, Patience, Consistency and Prep & Reflection, weighted toward process over outcome, with a plain-English *why* and *tip* for each. |
| **Time Capsules** | Letters to your future self that arrive inside a future briefing. |
| **Thunder, the AI coach** | A chat coach that has read your last 90 days of trades, rule breaks and journal entries, plus AI-written briefing verdicts and journal reflections. |
| **Daily ritual** | Tick off your pre-market, post-session and life habits, plus ad-hoc to-dos for the day. |

---

## Deploy to Vercel (about 5 minutes)

The code has **no secrets in it**. A fresh deploy builds with zero variables and shows a setup screen at `/setup`
that walks you through the rest.

1. **Add the free database.** In the Vercel project, open *Storage → Create Database → Neon* → **Free** plan →
   region *London* → **Connect** (tick all environments). Vercel fills `DATABASE_URL` for you — nobody, including
   any AI assistant, ever sees the database password. Tables are created automatically on first launch.
2. **Paste your secrets.** Open your site's `/setup` page. It generates `ENCRYPTION_KEY` and `CRON_SECRET` *in your
   browser* as one block. In Vercel, go to *Settings → Environment Variables*, click into **Key**, paste (Vercel splits
   it into both variables), tick **Sensitive**, and save. Optionally add `ANTHROPIC_API_KEY` for the AI features.
3. **Redeploy.** *Deployments → latest → ⋯ → Redeploy*.
4. **Claim it.** Reopen the site on the same device. It asks you to choose your passphrase (the one-time setup code
   fills itself in), then offers Face ID / Touch ID. Only someone holding `ENCRYPTION_KEY` can derive the setup code,
   so nobody can claim the journal before you do.

> **Tip:** On iPhone, open the site in Safari and use *Share → Add to Home Screen*. It runs full screen like a native app.

### Why Neon and not Supabase?
Both are free Postgres and the app works with either. Supabase's free plan allows only **two active projects per
account**, so if you already run two, a third means pausing one. Neon through Vercel Storage is free, fully separate
from your other projects, and injects its credentials straight into Vercel. To use Supabase instead, set
`DATABASE_URL` to its *transaction pooler* connection string.

---

## Connecting your accounts

| Route | Cost | Works for | How |
| --- | --- | --- | --- |
| **TopstepX share link** | Free | Topstep Combine and Express Funded | TopstepX → *Performance stats* → **Share** → paste the link in *Settings → Connections*. No login or API key is stored. Syncs on open and nightly. |
| **Import a file** | Free | Lucid, Tradeify, Apex, any Tradovate / Rithmic / NinjaTrader / TopstepX account | Export trades as CSV, then drop the file on *Trades → Import*. The format is detected automatically (Tradovate *Performance* and *Orders/Fills*, TopstepX trades, generic round-trip files). Re-importing the same file never duplicates. Lucid's commission rates can be applied if your export has none. |
| **TopstepX API** | $14.50/mo (code `topstep`) | Topstep — new accounts appear automatically | Subscribe to ProjectX API at dashboard.projectx.com, then TopstepX → *Settings → API* → *Add API Key*. |
| **Tradovate API** | Tradovate's paid add-on | Your own funded Tradovate login | Tradovate → *Application Settings → Add-Ons → API Access*. Prop-firm accounts usually can't use it. |

**Your logins are safe:** credentials are verified, then encrypted with AES-256-GCM using a key that exists only in
your Vercel environment. They are never shown again, never logged and never exported. The app **cannot place
trades** — every broker client is restricted to an allowlist of read endpoints. See [SECURITY.md](./SECURITY.md).

### Why not "log in with Tradovate" like a trade copier?
Copiers such as Tradecopia connect Tradovate prop accounts through Tradovate's partner OAuth, which Tradovate only
issues to approved vendor apps — a private single-user app can't obtain it. Free CSV import covers those accounts
today; if Tradovate partner access is ever granted, the journal is built to add it as another connection.

---

## AI

| | |
| --- | --- |
| Provider | Anthropic Claude (`@anthropic-ai/sdk`) |
| Default model | `claude-opus-5-5` (best coaching quality). Set `AI_MODEL=claude-haiku-5-5` to cut costs by ~40×. |
| Typical cost | About $0.02–0.05 per briefing or reflection on Opus 5.5. Briefings are cached until your data changes. |
| What's sent | Summarised stats plus your journal text. Never credentials or account numbers. |

Without a key, everything still works: insights, the report card, Rule Lab, Tilt Radar and Guardian are all
deterministic. The AI adds the narrative verdicts, reflections and chat.

---

## Development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and ENCRYPTION_KEY; choose your passphrase in-app
npm run dev                  # http://localhost:3000
npm test                     # analytics, round-trip and import unit tests
npm run typecheck
```

Stack: Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, Motion, Postgres (`postgres`), SimpleWebAuthn, Anthropic SDK.

```
app/                 routes (Today, Trades, Journal, Insights, Guardian, Coach, Settings, Briefings, API)
components/          UI — briefing story player, charts, rings, forms
lib/analytics/       pure, tested engines: stats, rules, tilt, what-if, prop/Monte Carlo, report card, insights, briefings
lib/brokers/         read-only TopstepX (API + share link) + Tradovate clients, FIFO round-trip builder, sync
lib/import/          CSV parsing, format detection and fee schedules for free file import
lib/auth/            sessions, passkeys, rate limiting
lib/ai/              Claude briefing, reflection and coach
proxy.ts             auth gate + per-request CSP nonce
```
