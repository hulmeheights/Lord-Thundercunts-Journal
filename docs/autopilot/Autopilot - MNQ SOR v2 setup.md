---
title: Autopilot · MNQ SOR v2 · full setup
updated: 2026-11-05
tags: [trading, autopilot, topstep, mnq, bot]
---

# Autopilot · MNQ Session Open Reversal v2

Everything about how the strategy and the bot are set up, so it can all be rebuilt if anything is lost.
No passwords, keys or secrets are written here: they live only where noted.

---

## 1. How it fits together

```
TradingView (MNQ1! 1m, "MNQ Session Open Reversal - Signals [1m]")
   │  one alert: every possible trade, {"event":"signal", …}
   ▼
Journal website (Vercel): lord-thundercunts-journal.vercel.app
   │  checks the secret, ignores repeat ids, stores the signal (never the secret)
   │  NO connection to Topstep at all
   ▼
Python bot on the Mac mini (Haydons-Mini), runs all the time
   │  runs the 12 decision steps per account card, places orders from home
   ▼
TopstepX (ProjectX API) → your Combine / Express accounts
```

- **Why the Mac:** Topstep requires all trading to come from your own device. No VPS, VPN or remote server may place, change or cancel orders. The website only stores and shows things.
- **Topstep support confirmed the setup** (Laura, 2 Nov 2026). Screenshot: repo `docs/topstep/2026-11-02-topstep-support-api-approval.png`.
- **The bot can't trade a Topstep *Live* funded account.** The API isn't allowed there, so a Live account is traded by hand and must never be on a card.

---

## 2. Where everything lives

| Thing | Where |
|---|---|
| Website code | GitHub `hulmeheights/lord-thundercunts-journal`, branch `claude/thundercunts-journal-premium-m14dqu` (default) |
| Website | https://lord-thundercunts-journal.vercel.app → **07 Autopilot** |
| Webhook URL (for TradingView) | `https://lord-thundercunts-journal.vercel.app/api/bot/webhook` |
| Webhook secret | **Vercel env `BOT_WEBHOOK_SECRET`** (≥16 chars), and the same value in the TradingView script's *Webhook Secret* setting. Nowhere else. |
| TopstepX username + API key | **Only on the Mac**: `~/.thunder-autopilot.json` (chmod 600). Never in Vercel. |
| Mac bot program | `~/Library/Application Support/ThunderAutopilot/autopilot-runner.py` (download copy at `~/autopilot-runner.py`) |
| Mac bot log | `~/Library/Logs/ThunderAutopilot.log` |
| Mac auto-start | LaunchAgent `com.thunder.autopilot` (runs under `caffeinate`, restarts itself) |
| Spec PDF / stats PDF | repo `docs/autopilot/` (stats: `MNQ-SOR-v2-backtest-stats.pdf`) |
| 2-year expected trades | repo `tests/fixtures/expected-trades-2024-11-to-2026-11.csv` |

**Vercel env vars:** `BOT_WEBHOOK_SECRET` (needed). Optional: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`. **Never** add TopstepX keys to Vercel. (Don't touch the separate Vercel project "bhpcbd".)

**New secret:** on the Mac run `openssl rand -hex 24`, put it in Vercel `BOT_WEBHOOK_SECRET`, redeploy, then paste the same value into the TradingView script's Webhook Secret.

---

## 3. Mac bot commands (Terminal)

```bash
# install / update to the latest version (run both lines)
curl -fsSL -o ~/autopilot-runner.py https://lord-thundercunts-journal.vercel.app/autopilot-runner.py
python3 ~/autopilot-runner.py install

python3 ~/autopilot-runner.py setup      # first time only: journal URL, Mac key from Autopilot → Your Mac, TopstepX username + API key
python3 ~/autopilot-runner.py status     # running? last log lines
python3 ~/autopilot-runner.py uninstall  # stop and remove

grep "started" ~/Library/Logs/ThunderAutopilot.log | tail -1   # which version is running
tail -20 ~/Library/Logs/ThunderAutopilot.log                    # what it's been doing
```

- **Current version:** bot **3.1**.
- **Mac settings:** Energy → prevent automatic sleeping, start up after a power failure, log in automatically. Keep it on Wi-Fi/Ethernet during sessions.
- **After a power cut:** just log in. The bot starts by itself.
- **New Topstep account not showing:** the Mac refreshes the account list every 10–15 min. To refresh now, run `python3 ~/autopilot-runner.py install` again. A brand-new Combine only shows once TopstepX makes it *active*.

---

## 4. TradingView setup

1. Chart: **MNQ1! 1-minute**.
2. Add the indicator **"MNQ Session Open Reversal - Signals [1m]"** (Pine v5, an *indicator*, not a strategy).
3. Its settings: **Webhook Secret** = the value in Vercel. Leave every other input on the tested defaults:
   - sessions NYAM 09:30–12:00, NYPM 13:30–15:55, London 03:00–06:00, Asia 20:00–23:59 (New York time)
   - signals sent for the first 150 min of each session
   - min run 15 pt, stop buffer 1 pt, stop 4–76 pt, min RR 1.8
   - quiet when ATR(60) < 8, quiet target 15 pt, untapped levels kept 5 days
4. **One alert:** Condition = the script → **"alert() function calls only"** (or "Any alert() function call"). Leave the Message box as it is, because the script writes its own message. Notifications → tick **Webhook URL** = the URL above. Expiry: as long as allowed, then put the date in Autopilot → Setup → alert expiry, which reminds you before it runs out.
5. Delete every older alert and remove old strategy scripts (v1.3, "SOR B" etc.) from the chart.

The signal message looks like this (the secret is never stored by the journal):
`{"secret":"…","event":"signal","swing":"3/3","session":"LON","dow":"Tue","mins_in":47,"quiet":false,"dir":"LONG","entry":28133.5,"stop":28103.25,"target":28254.25,"quiet_target":null,"atr":14.11,"id":"1762160520000-3/3-L"}`

- `swing` 3/3 = eval signal set, 3/2 = funded signal set (one candle can send one of each)
- `dow` = trading-day weekday (Sunday evening counts as Monday)
- `target` null = no valid normal target; `quiet_target` only when quiet

---

## 5. Topstep account settings (every account, every new Combine)

- **Auto OCO Brackets: ON** (not "Position Brackets"). Without it Topstep rejects the order with *"Brackets cannot be used with Position Brackets"*. This already cost a trade on a new account once.
- Topstep's own trade copier: **OFF** (the bot does the mirroring).
- Personal Daily Profit Target: **"Do nothing"**, or above $1,600.
- The API subscription (ProjectX) must be active.

---

## 6. Autopilot page (website), section by section

1. **Switch:** Off / Paper / **Live**. Live needs typing LIVE and the Mac connected. Paper = every card runs as a dry run.
2. **Your Mac:** connection light, Mac key (make a new one here if needed), version.
3. **Accounts (cards):** one per Topstep account. See section 7.
4. **News:** ±11 min blackout around high-impact US news (Forex Factory). Only applies to cards with *Follows the news blackout* on.
5. **The book:** every signal per card: taken (live / dry run), or skipped with "step N: reason".
6. **Dry-run check:** upload an expected-trades CSV, and it lists every missing, extra or different trade per card.
7. **Track record:** **Backtest · 2 years** (eval / funded, 721 trades, plus Combine pass-rate and payout simulations, plus the bot's own trades added as they close), **Live · your accounts** (fills in by itself), **TradingView imports**.
8. **Evals & payouts:** the bot's own ledger (evals bought, passed, blown, payouts, costs). Separate from Guardian's. Log each Combine as *Evaluation*, each monthly re-bill as *Subscription*, a pass as *Passed*, payouts as *Payout*.
9. **Setup:** checklist, webhook URL, alert expiry date.
10. **Log:** everything that happened.

**Notifications (phone):** only when a trade **closes** (with P&L), and if an order **fails** on a switched-on card. Quiet between **14:00–16:30** (Settings → Notifications). Telegram, if set up, also gets one message per order placed.

---

## 7. Account card settings

**Account type**: one click sets the tested rules:

| Setting | Eval / Combine | Funded / Express |
|---|---|---|
| Signal set (`swing`) | 3/3 | 3/2 |
| Sessions | NYAM, NYPM, LON | NYAM, NYPM, LON, ASIA |
| Skip days | Thu | none |
| Entry window (min) | NYAM 90, NYPM 90, LON 120 | 150 every session |
| Quiet signals | take, using `quiet_target` (15 pt) | skip |
| Min RR (daily-cap check) | 1.8 | 1.8 |
| Day target (Max daily win) | **$1,600** | **$1,600** |
| Day loss (Max daily loss) | −$500 | −$500 |
| Max trades a day / a session | 4 / 1 | 4 / 1 |
| Stop the week after | 2 losing days | 2 losing days |
| Contracts | 5 MNQ | 5 MNQ |

Other fields on each card:
- **On/off** toggle next to the name.
- **TopstepX account** (name or ID from the Mac's list).
- **Dry run / Real orders**: dry run logs everything and follows each trade to its stop or target on 1-minute bars, placing nothing.
- **Account profit target** (e.g. 3,001 for a 50K Combine) and **Starting balance**: the card switches itself off once passed.
- **Follows the news blackout.**
- **Rules** (folded): fine-tune anything above; "Back to the tested defaults" resets.

**When a Combine passes:** click **Funded / Express** on that card. Nothing changes in TradingView. Its losing-day count for the week carries over.

---

## 8. The decision (runs on the Mac, per card, for every signal)

Stops at the first failed step and logs it ("step N" in the book):

1. **Enabled.**
2. **Signal set:** `swing` matches the card (eval 3/3, funded 3/2).
3. **Session** is one of the card's sessions.
4. **Weekday** (`dow`) not in skip days.
5. **Window:** `mins_in` below the card's window for that session.
6. **Quiet:** if quiet, funded skips; eval uses `quiet_target` and min reward 0.
7. **Normal target:** if not quiet, `target` must exist; min reward = 1.8 × risk.
8. **Flat:** no open position (Topstep) and no open trade in the ledger.
9. **Session count:** fewer than 1 trade in this session today.
10. **Day:** fewer than 4 trades today; today's P&L above −$500 and below $1,600.
11. **Week:** fewer than 2 losing days so far this week.
12. **Daily cap on the target:** cap = entry ± (1,600 − today's P&L) ÷ (contracts × $2). If the target is beyond it, pull it in (*capped*). Skip if capped *and* reward < min reward *and* < 0.5 × risk. Round to 0.25.

Then the bot's own safety checks, logged as **step 13**:
- news blackout (if switched on for that card)
- the card's profit target reached
- the Topstep account found
- **no hedging**: no live order anywhere if any of your accounts holds the opposite side

**Counting days** (matches the 2-year backtest):
- The trading day runs 18:00 → 18:00 New York. Sunday evening counts as Monday, and the week starts Sunday 18:00 New York.
- **Today's P&L** (limits and cap): a trade counts on the day it **closes**.
- **Losing days:** a trade counts on the day it was **entered**.
- Everything is rebuilt from the ledger, never from memory, so restarts are safe.

**Orders:**
- A market order for the card's contracts, with stop and target attached (OCO). Straight after the fill they're moved to the **exact** script stop and decided target, so a late fill only changes the entry.
- A rejected order is logged, not retried and not counted. You get a push saying why (e.g. "turn on Auto OCO Brackets").
- After any close, the bot reads the P&L from Topstep and **cancels every leftover order on that account**, even if the close happened while things were down. So don't leave your own limit orders on bot accounts.
- Signals are valid only on their own candle: anything older than 20 seconds is never placed. A repeat of the same signal id is ignored.

---

## 9. Testing done

- **Unit tests:** all 13 worked examples from the spec, plus the 18:00 New York roll, Sunday = Monday, the week reset, rounding to 0.25, a repeated id, and a wrong secret. Run with `python3 -m unittest tests/test_autopilot_runner.py` and `npm test`.
- **2-year replay:** all 721 backtest trades through steps 1–12 with real exits. **720/721 decided the same.** The one difference is a trade that closed exactly at the Sunday 18:00 reopen.
- **End-to-end run against a fake Topstep:** order placed, exact SL/TP, close detected with Topstep's P&L, leftover order cancelled, dry run followed to its target, secret never stored or logged.

---

## 10. Backtest stats (Nov 2024 – Nov 2026, 5 MNQ, after commission)

| | Eval (3/3) | Funded (3/2) |
|---|---|---|
| Trades | 354 | 367 |
| Win rate | 47.7% | 34.6% |
| Profit factor | 1.52 | 1.61 |
| Net (one account's trades, never busting) | +$33,965 | +$59,902 |
| Avg win / loss | $584 / −$350 | $1,244 / −$408 |

- **Hedging:** 9 eval/funded overlaps on opposite sides in 2 years. The guard skips 8 eval trades (−$948) and 1 funded trade (+$221). Only matters with eval and funded live at once.
- **Funded target:** aim for **$4,000**, then withdraw $2,000 ($1,800 to you). 56% reach it before busting, worth about $1,007 per account. Lower targets barely improve the odds, and above $4,000 Topstep caps the payout.
- **5 copied accounts move together:** they pass, bust and pay out as one. Five multiplies the money; it doesn't spread the risk. To spread risk, start sets at different times.

**Topstep vs Lucid (5 accounts, start to first payout):**

| | Topstep 50K | Lucid 50K |
|---|---|---|
| Eval price | $120/month until passed | $180 once |
| Eval day cap / consistency | $1,600 / 50% | $1,200 / 40% |
| Eval pass rate | 75% | 64% |
| Funded reaches $4,000 | 56% | 56% |
| Payout to you (5 accounts) | $9,000 | $18,000 (full $4,000 each, you keep 90%) |
| Avg eval fees to first payout | $1,707 | $1,633 |
| Typical time to first payout | 13 weeks | 15 weeks |
| Avg net on first payout day | $7,293 | $16,367 |

**Realistic case (every trade $50 worse), Topstep, sets of 5, rebuying when the whole set fails or busts:**
- **First payout:** typically ~16 weeks after real orders start. 1 in 4 runs take over 23 weeks, 1 in 10 over 28 weeks, and the worst was ~36 weeks.
- **Fees to first payout:** ~$1,800–2,400. 1 in 10 runs cost $4,800, the worst $6,600. About 2 sets.
- **While funded,** payouts come every ~3½–4 weeks. Sets before busting: 45% get 0 payouts, 30% get 1, 11% get 2, 13% get 4–6.
- **Over 12 months:** ~5–6 payout days, $2,400–3,500 in fees, ~$45–50k net on average. 1 year in 10 came below $21k, and the worst was ~$1.8k.
- **Caveats:**
  - The settings were tuned on these same 2 years, so live will be worse. October 2026 lost money in both modes.
  - Topstep usually moves you to Live around the 3rd–5th payout and closes the Express accounts. The bot can't trade Live.
  - Not included: activation or data fees, the API fee, tax.

**Protect yourself:** set an eval budget (e.g. $2,400 = two sets) and review before spending more. Compare live results with the backtest in Track record every couple of weeks, and pause if they sit well below for a month. Keep $4,200+ available.

---

## 11. Firm rules (as found Nov 2026: always re-check the firm's own help pages)

- **Topstep:**
  - API bots allowed on the Combine and Express accounts, **not Live**. Orders only from your own device (no VPS or VPN).
  - No cross-account hedging, including your manual trades against the bot's.
  - Mixing your own trades with the bot on the same account isn't banned; the same rules apply.
  - After a Live breach you can start a new Combine straight away, but must go through Express again to return to Live.
  - A pattern of repeated breaches or resets can trigger the "Focused Trader" plan, which closes all accounts.
- **Lucid:** bots and copiers allowed on eval, funded and live. No HFT or microscalping (over 50% of profits from trades of 5 seconds or less). No hedging across accounts (permanent ban). Up to 5 LucidLive accounts per household.
- **Tradeify:** personal bots allowed (no HFT), you must own the strategy (they may ask for proof), max 5 funded accounts. Check their policy on running the same bot at other firms.

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| Card didn't trade | Check The book (step N reason) or `tail -20 ~/Library/Logs/ThunderAutopilot.log` |
| "Brackets cannot be used with Position Brackets" | TopstepX → that account → Settings → turn on **Auto OCO Brackets** |
| "No TopstepX account matches" | Wait 10–15 min or rerun `install`. The account must be active. |
| Mac shows offline | Mac awake, online, logged in? Run `python3 ~/autopilot-runner.py status` |
| "Connection problem … retrying" in the log | Internet blip. It reconnects by itself. |
| Signal "too old" | The Mac was off or offline for over 20 s. Nothing is placed (on purpose). |
| Alert stopped coming | Renew the TradingView alert (expiry), then update the date in Autopilot → Setup |
| Lost the secret | Make a new one (section 2) and update Vercel and TradingView |
| Imported trades on the wrong date | The importer reads the date order per file, and shows "Trades on …" before you import. Flip US/UK if it looks wrong. |
