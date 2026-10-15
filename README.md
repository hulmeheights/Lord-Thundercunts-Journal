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

## Deploy to Vercel (about 10 minutes)

The code has **no secrets in it**, so a fresh deploy builds and shows a setup screen until you add the variables below.

1. **Create the project.** In Vercel, choose *Add New → Project* and import `hulmeheights/Lord-Thundercunts-Journal`. Leave every setting at its default; Next.js is detected automatically.
2. **Add a database.** In the project, open *Storage → Create Database → Neon (Postgres)* and connect it to the project. This adds `DATABASE_URL` for you. The free tier is plenty, and tables are created automatically on first launch.
3. **Add secrets.** Under *Settings → Environment Variables*, add each one with **Sensitive** ticked:
   | Name | Value |
   | --- | --- |
   | `OWNER_PASSWORD` | Your unlock passphrase (12+ characters) |
   | `ENCRYPTION_KEY` | 32+ random characters (the setup screen has a generator) |
   | `CRON_SECRET` | 16+ random characters (enables nightly auto-sync) |
   | `ANTHROPIC_API_KEY` | *(optional)* From [console.anthropic.com](https://console.anthropic.com), powers the AI coach |
4. **Redeploy.** Go to *Deployments → ⋯ → Redeploy*.
5. **Open your site**, unlock with your passphrase, then go to *Settings → Security → Add passkey* to unlock with Face ID / Touch ID from then on.

> **Tip:** On iPhone, open the site in Safari and use *Share → Add to Home Screen*. It runs full screen like a native app.

### Why it wouldn't deploy before
The GitHub repository was empty (no commits on any branch), so Vercel had nothing to build. It now contains a complete
Next.js 16 app that builds with zero configuration and renders every page per request, so the build never needs the database.

---

## Connecting your accounts (no more CSV imports)

### TopstepX (recommended for Topstep)
1. Subscribe to **ProjectX API Access** at [dashboard.projectx.com](https://dashboard.projectx.com). It's $29/mo, or **$14.50/mo with code `topstep`**.
2. In TopstepX, go to **Settings → API**, click **Add Link**, then **Add API Key**.
3. In the journal, open **Settings → Connections → TopstepX** and enter your TopstepX username (not your email) and the API key.
4. Your full history back-fills (up to 365 days), then syncs every time you open the app and nightly after the close.

### Tradovate
1. In Tradovate, go to **Application Settings → Add-Ons** and enable **API Access**. Tradovate requires a funded live account for this.
2. **API Access → Generate API Key**, then copy the **CID** and **Secret**.
3. In the journal, open **Settings → Connections → Tradovate** and enter your username, password, CID and Secret.
4. Tradovate's API only returns recent fills, so the journal stores every sync permanently. Keep the nightly sync on (`CRON_SECRET`) so nothing is missed. Older trades can be added with **Trades → Add trade**.

**Your logins are safe:** they're verified, then encrypted with AES-256-GCM using a key that lives only in Vercel. They are
never shown again, never logged and never exported. The app **cannot place trades**, because its broker clients only
have read endpoints. See [SECURITY.md](./SECURITY.md).

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
cp .env.example .env.local   # fill in DATABASE_URL, OWNER_PASSWORD, ENCRYPTION_KEY
npm run dev                  # http://localhost:3000
npm test                     # analytics + round-trip unit tests
npm run typecheck
```

Stack: Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, Motion, Postgres (`postgres`), SimpleWebAuthn, Anthropic SDK.

```
app/                 routes (Today, Trades, Journal, Insights, Guardian, Coach, Settings, Briefings, API)
components/          UI — briefing story player, charts, rings, forms
lib/analytics/       pure, tested engines: stats, rules, tilt, what-if, prop/Monte Carlo, report card, insights, briefings
lib/brokers/         read-only TopstepX + Tradovate clients, FIFO round-trip builder, sync
lib/auth/            sessions, passkeys, rate limiting
lib/ai/              Claude briefing, reflection and coach
proxy.ts             auth gate + per-request CSP nonce
```
