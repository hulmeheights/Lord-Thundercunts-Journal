# Lord Thundercunts Journal ◆

A private, AI-powered trading journal for futures prop traders, in the same warm-black, cream-and-gold editorial
style as Meridian (see [docs/DESIGN.md](./docs/DESIGN.md)). It logs your trades automatically from **TopstepX** and
**Tradovate** (Lucid, Tradeify and other Tradovate prop accounts), tracks what your evals cost against what they
paid, and replays every day, week and month as a full-screen keynote.

---

## What makes it different

| Feature | What it does |
| --- | --- |
| **The Observer** | Your trading written up in the third person, like a coach watching from across the room: what you want, what you actually do, what's stopping you (ranked by what it costs), and the order you'd give yourself. You can pin one order a day and it gets checked against the real trades. |
| **Eval ledger** | In Guardian: every evaluation, reset, activation and subscription you paid, against every payout. Refund-aware, per firm, with the real return on what the evals cost. |
| **Replays** | Daily, weekly and monthly debriefs as full-screen slides: money made and lost, scoreboard, equity curve, best and worst trade, your edge, your leak, discipline, report card, prop status, AI coach verdict, and the *one thing* to fix next. They refresh as new trades sync. |
| **Process, not P&L** | Three things you control are scored every day: **Prepared** (ritual, readiness, intention), **Disciplined** (every trade inside your rules) and **Reflected** (review written). Streaks reward process. |
| **Auto-enforced rules** | Max trades, daily loss, losing-streak stop, size, trading window and cool-down are checked against every synced trade. No self-reporting needed. |
| **Rule Lab (ghost curve)** | Replays your real trades under different rules ("stop after 2 losses", "done by 11:30", "skip Fridays") and draws the equity curve you *would* have had. It also suggests the rules that would have paid you most. |
| **Tilt Radar** | Detects revenge trading from behaviour alone: fast re-entries after a loss, sizing up, trading through a losing streak. It shows what tilt costs you in dollars. |
| **Prop Guardian** | Topstep-style rules tracked live: end-of-day trailing max loss, daily loss limit, consistency target and profit target. A **Monte Carlo** simulation of 4,000 futures built from your own days estimates your odds of passing or blowing the account. |
| **Mind ↔ Market** | A morning readiness check-in (sleep, energy, focus, mood), correlated with your P&L. It shows how much your state is worth in dollars. |
| **Report Card** | You're graded on Discipline, Risk, Edge, Patience, Consistency and Prep & Reflection, weighted toward process over outcome, with a plain-English *why* and *tip* for each. |
| **Photos in the journal** | Add photos to any journal day (marked-up charts, a screenshot of the moment it went wrong, a notebook page): drop them in on a computer or take one on your phone. They're shrunk on your device, stored **encrypted** (AES-256-GCM) in your own database and only ever shown to you signed in. |
| **The eye (privacy)** | One tap blurs every figure, P&L, price, chart, money mention and photo, so you can show someone the journal without showing what your accounts are doing. It stays on across pages and reloads until you tap it again. |
| **Time Capsules** | Letters to your future self that arrive inside a future briefing. |
| **Thunder, the AI coach** | A chat coach that has read your last 90 days of trades, rule breaks and journal entries. Conversations are saved (on every device) and after each one the coach keeps a short **note**: what you discussed and what you committed to. New chats read the recent notes, not the old transcripts, so it follows up like a real coach without the cost creeping up. Delete any conversation and it's forgotten completely. |
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
| **Log in with Tradovate** | Free (beta) | Lucid, Tradeify and any Tradovate prop / eval account | *Settings → Connections → Log in with Tradovate*. You sign in on Tradovate's own page (trader.tradovate.com, the same one Tradecopia uses), then paste the address it lands on back into the journal once. Uses NinjaTrader's self-service OAuth (dynamic registration + PKCE), so no API add-on and no password is ever stored here. Tradovate keeps a sign-in for about a day and every sync renews it; the journal syncs twice a day (09:20 and 21:20 UTC) plus whenever you open it, so it stays connected on its own. |
| **TopstepX username + API key** | The same key Tradecopia uses | Topstep: new Combines and Express accounts appear by themselves | TopstepX → *Settings → API*. If you already linked Tradecopia, the key comes from the same place, and if you already pay for ProjectX API access it costs nothing extra here. |
| **TopstepX share link** | Free | Topstep Combine and Express Funded | TopstepX → *Performance stats* → **Share** → paste the link. Nothing to log in to. |
| **Import a file** | Free | Any Tradovate / Rithmic / NinjaTrader / TopstepX account | Drop a CSV export on *Trades → Import*. The format is detected automatically and re-importing never duplicates. |
| **Tradovate API key** | Tradovate's add-on | Your own funded live account | Advanced. Prop accounts should use *Log in with Tradovate*. |

**Your logins are safe:** credentials are verified, then encrypted with AES-256-GCM using a key that exists only in
your Vercel environment. They are never shown again, never logged and never exported. The app **cannot place
trades** — every broker client is restricted to an allowlist of read endpoints. See [SECURITY.md](./SECURITY.md).

### How "Log in with Tradovate" works
Tradecopia uses Tradovate's partner OAuth, which is only issued to approved vendors. NinjaTrader (Tradovate's owner)
now runs a public, self-service OAuth server for its read-only MCP service, and the journal uses that: it registers
itself, sends you to Tradovate's sign-in with a PKCE challenge, and keeps only an encrypted, rotating refresh token.
Tradovate only lets this sign-in return to a `localhost` address, so after you log in the tab lands on a page that
can't load; you paste that address into *Settings* once and the journal swaps the code for tokens. It can only call
read tools (accounts, fill history): Tradovate's consent screen lists orders under full access because that's the fixed
permission set for this sign-in, but every tool that could act on an account is refused in code before a request is
made. The flow state travels in a sealed, ten-minute, this-browser-only cookie and is checked against the `state`
Tradovate echoes back. The refresh token lasts about a day and rotates on every use, so the twice-daily sync keeps it alive. The service is labelled beta by NinjaTrader; if it ever changes,
CSV import still covers every account.

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
