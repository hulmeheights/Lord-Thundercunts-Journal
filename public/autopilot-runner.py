#!/usr/bin/env python3
"""
Thunder Autopilot: the bot, running on your Mac.

Topstep requires all trading to come from your own computer, so the whole bot
runs here. Your journal website only stores TradingView's alerts and your
settings, and shows the book: it never contacts Topstep. For each alert this
program applies every rule (live or not, accounts on, news blackout, daily loss
and max win, profit targets, flat and hedge checks), places the bracketed orders
at TopstepX from this Mac, and tells the journal what it did.

  python3 autopilot-runner.py setup      # once: saves your details (only on this Mac)
  python3 autopilot-runner.py install    # starts it now and every time you log in, keeps the Mac awake
  python3 autopilot-runner.py status     # is it running?
  python3 autopilot-runner.py test       # send a test LONG at the live price (20 pt stop, 15 pt target)
  python3 autopilot-runner.py uninstall  # stop it and remove it
  python3 autopilot-runner.py run        # run in this window instead (Ctrl+C to stop)

To update: download it again (the same curl line) and run install again.
Standard library only: nothing extra to install.
"""
import getpass
import json
import os
import platform
import shutil
import ssl
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
import math
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo

    NY = ZoneInfo("America/New_York")
except Exception:  # very old Python: fixed offsets are close enough for the logs, never used to place
    NY = None

VERSION = "3.6"
TOPSTEP = os.environ.get("THUNDER_TOPSTEP_URL", "https://api.topstepx.com")  # override only for testing
TICKET_TTL_MS = 20_000  # never place a ticket older than this: a late entry is a different trade
HOME = os.path.expanduser("~")
CONFIG = os.path.join(HOME, ".thunder-autopilot.json")
APP_DIR = os.path.join(HOME, "Library", "Application Support", "ThunderAutopilot")
LOG = os.path.join(HOME, "Library", "Logs", "ThunderAutopilot.log")
LABEL = "com.thunder.autopilot"
PLIST = os.path.join(HOME, "Library", "LaunchAgents", LABEL + ".plist")


def log(msg):
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  {msg}"
    print(line, flush=True)


def ssl_context():
    ctx = ssl.create_default_context()
    if not ctx.get_ca_certs():
        # Some Python installs ship without certificates; fall back to the Mac's own.
        for path in ("/etc/ssl/cert.pem", "/private/etc/ssl/cert.pem"):
            if os.path.exists(path):
                ctx.load_verify_locations(path)
                break
    return ctx


CTX = ssl_context()


def http(method, url, body=None, headers=None, timeout=10):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def load_config():
    if not os.path.exists(CONFIG):
        sys.exit("Not set up yet. Run:  python3 autopilot-runner.py setup")
    with open(CONFIG) as f:
        return json.load(f)


class Topstep:
    """Your TopstepX API, called only from this Mac."""

    def __init__(self, user, key):
        self.user, self.key, self.token, self.at = user, key, None, 0
        self.contract, self.contract_at = None, 0

    def login(self):
        if self.token and time.time() - self.at < 20 * 60:
            return self.token
        code, d = http("POST", TOPSTEP + "/api/Auth/loginKey", {"userName": self.user, "apiKey": self.key})
        if code != 200 or not d.get("success") or not d.get("token"):
            raise RuntimeError(f"TopstepX login failed ({code}: {d.get('errorMessage') or d.get('errorCode') or 'check username and API key'})")
        self.token, self.at = d["token"], time.time()
        return self.token

    def call(self, path, body):
        code, d = http("POST", TOPSTEP + path, body, {"Authorization": "Bearer " + self.login()})
        if code == 401:  # token expired early: log in again once
            self.token = None
            code, d = http("POST", TOPSTEP + path, body, {"Authorization": "Bearer " + self.login()})
        if code != 200 or d.get("success") is False:
            raise RuntimeError(f"{path.split('/')[-1]} failed ({code}: {d.get('errorMessage') or d.get('errorCode') or 'no reason given'})")
        return d

    def accounts(self):
        return self.call("/api/Account/search", {"onlyActiveAccounts": True}).get("accounts") or []

    def mnq(self):
        if self.contract and time.time() - self.contract_at < 3600:
            return self.contract
        found = self.call("/api/Contract/search", {"searchText": "MNQ", "live": False}).get("contracts") or []
        pick = next((c for c in found if str(c.get("name", "")).upper().startswith("MNQ") and c.get("activeContract", True)), None) or next(
            (c for c in found if str(c.get("name", "")).upper().startswith("MNQ")), None
        )
        if not pick:
            raise RuntimeError("no MNQ contract found")
        self.contract, self.contract_at = pick["id"], time.time()
        return self.contract

    def positions(self, account_id):
        return [p for p in (self.call("/api/Position/searchOpen", {"accountId": account_id}).get("positions") or []) if p.get("size", 0) != 0]

    def place(self, account_id, contract_id, direction, size, stop_ticks, target_ticks, tag):
        # One atomic market order with its stop and target attached at Topstep (OCO).
        # Bracket ticks are signed from the fill: long = stop below (negative), target above.
        sign = 1 if direction == "LONG" else -1
        d = self.call(
            "/api/Order/place",
            {
                "accountId": account_id,
                "contractId": contract_id,
                "type": 2,
                "side": 0 if direction == "LONG" else 1,
                "size": size,
                "customTag": tag,
                "stopLossBracket": {"ticks": -stop_ticks * sign, "type": 4},
                "takeProfitBracket": {"ticks": target_ticks * sign, "type": 1},
            },
        )
        return str(d.get("orderId", ""))

    def open_orders(self, account_id):
        return self.call("/api/Order/searchOpen", {"accountId": account_id}).get("orders") or []

    def cancel(self, account_id, order_id):
        self.call("/api/Order/cancel", {"accountId": account_id, "orderId": order_id})

    def trades(self, account_id, since):
        return [t for t in (self.call("/api/Trade/search", {"accountId": account_id, "startTimestamp": since}).get("trades") or []) if not t.get("voided")]

    def bars(self, contract_id, start, end):
        """1-minute bars (read-only market data) for following a dry-run trade to its stop or target."""
        d = self.call(
            "/api/History/retrieveBars",
            {"contractId": contract_id, "live": False, "startTime": start, "endTime": end, "unit": 2, "unitNumber": 1, "limit": 1000, "includePartialBar": False},
        )
        return sorted(d.get("bars") or [], key=lambda b: b["t"])

    def snap(self, account_id, contract_id, direction, stop, target):
        """
        Moves the attached stop and target onto your script's exact prices, so a
        late fill only changes the entry, never the levels. They stay Topstep's
        own linked bracket (one cancels the other). A level already passed is
        left where Topstep put it. Returns what moved, or why it couldn't.
        """
        fill = None
        for _ in range(10):  # the fill and its bracket can take a moment to show
            pos = [p for p in self.positions(account_id) if p.get("contractId") in (None, contract_id)]
            orders = [o for o in (self.call("/api/Order/searchOpen", {"accountId": account_id}).get("orders") or []) if o.get("contractId") in (None, contract_id)]
            fill = pos[0].get("averagePrice") if pos else None
            stop_o = next((o for o in orders if o.get("type") == 4), None)
            tp_o = next((o for o in orders if o.get("type") == 1), None)
            if fill and stop_o and tp_o:
                break
            time.sleep(0.3)
        else:
            return fill, "bracket not found at Topstep, left as placed"
        long = direction == "LONG"
        tick = lambda x: round(round(x * TICKS_PER_POINT) / TICKS_PER_POINT, 2)
        done = []
        if (stop < fill) if long else (stop > fill):
            self.call("/api/Order/modify", {"accountId": account_id, "orderId": stop_o["id"], "size": stop_o.get("size"), "stopPrice": tick(stop)})
            done.append(f"SL {tick(stop)}")
        else:
            done.append("SL left (fill already past it)")
        if (target > fill) if long else (target < fill):
            self.call("/api/Order/modify", {"accountId": account_id, "orderId": tp_o["id"], "size": tp_o.get("size"), "limitPrice": tick(target)})
            done.append(f"TP {tick(target)}")
        else:
            done.append("TP left (fill already past it)")
        return fill, f"filled {fill}, " + ", ".join(done)


# ── The rules (the same ones the journal shows you) ─────────────────────────

TICKS_PER_POINT = 4


def iso(t):
    return datetime.fromisoformat(t.replace("Z", "+00:00"))


def match_account(accounts, hint):
    h = str(hint or "").strip().lower()
    if not h:
        return None
    for test in (lambda a: str(a["id"]) == h, lambda a: a.get("name", "").lower() == h, lambda a: h in a.get("name", "").lower()):
        for a in accounts:
            if test(a):
                return a
    return None


def phase_skip(card, alert):
    """Script B: eval accounts take every trade; funded accounts skip quiet-market ones. A funded-chart alert never goes to an eval account."""
    phase = card.get("phase", "eval")
    mode = alert.get("mode")
    if mode == "funded" and phase == "eval":
        return "funded-chart alert: eval accounts follow the eval chart"
    if phase == "funded" and alert.get("quiet") and mode == "eval":
        return "quiet market: funded accounts skip quiet trades"
    return None


def bracket_problem(direction, price, stop, target):
    if direction == "LONG" and not (stop < price < target):
        return "stop must be below and target above the price for a long"
    if direction == "SHORT" and not (target < price < stop):
        return "stop must be above and target below the price for a short"
    return None


def day_gate(card):
    pnl = card.get("dayPnl", 0)
    if card.get("maxDailyWin") is not None and pnl >= card["maxDailyWin"]:
        return f"max daily win reached (${pnl:,.0f})"
    if pnl <= -card["maxDailyLoss"]:
        return f"daily loss limit hit (-${abs(pnl):,.0f})"
    return None


def news_block(alert, ctx):
    minutes = ctx.get("newsMinutes", 0)
    if minutes <= 0:
        return None
    at = iso(alert["receivedAt"])
    hits = [e for e in ctx.get("news", []) if abs((at - iso(e["at"])).total_seconds()) <= minutes * 60]
    if not hits:
        return None
    return f"news blackout: {', '.join(e['title'] for e in hits)} (±{minutes} min)"


def target_reached(card, balance):
    return card.get("profitTarget") is not None and balance is not None and balance - card["startBalance"] >= card["profitTarget"]


# ── MNQ SOR v2: one alert, every possible trade; each account decides (spec "Decision rules") ─────────

COMMISSION_PER_CONTRACT = 1.24  # $0.62 a side, as tested
TICK = 0.25


def rnd(x):
    """Nearest 0.25 (halves round up, never banker's rounding)."""
    return math.floor(x / TICK + 0.5) * TICK


def trading_date(t):
    """The trading day a moment belongs to: 18:00 New York starts the next one (Sunday evening is Monday)."""
    ny = t.astimezone(NY) if NY else t - timedelta(hours=5)
    d = ny.date()
    return d + timedelta(days=1) if ny.hour >= 18 else d


def week_start(d):
    """The Monday of a trading day's week (the week starts Sunday 18:00 New York)."""
    return d - timedelta(days=d.weekday())


def card_stats(ledger, now):
    """Rebuilt from the ledger every time, never from memory: today's P&L, trades and sessions, losing days this week, and whether a trade is open."""
    today = trading_date(now)
    wk = week_start(today)
    realized, sessions, trades_today, by_day, open_now = 0.0, Counter(), 0, defaultdict(float), False
    for r in ledger:
        if r.get("status") == "open":
            open_now = True
        if r.get("status") in ("open", "closed") and trading_date(iso(r["enteredAt"])) == today:
            trades_today += 1
            sessions[r.get("session")] += 1
        if r.get("status") == "closed" and r.get("exitedAt") and r.get("pnl") is not None:
            # Today's P&L (limits and the cap): a trade open over 18:00 counts on the day it closes.
            if trading_date(iso(r["exitedAt"])) == today:
                realized += r["pnl"]
            # Losing days: the days the account traded, so a trade belongs to the day it was entered
            # (this is what the 2-year backtest does: 721 of its 721 trades decided the same way, bar one).
            entered = trading_date(iso(r["enteredAt"]))
            if wk <= entered < today:
                by_day[entered] += r["pnl"]
    return {
        "realized": round(realized, 2),
        "tradesToday": trades_today,
        "sessions": dict(sessions),
        "losingDays": sum(1 for v in by_day.values() if v < 0),
        "inTrade": open_now,
    }


def decide(sig, card, stats, is_flat=None):
    """Steps 1-12 for one account. Stops at the first failed step. is_flat is only asked at step 8."""
    r = card["rules"]
    no = lambda step, why: {"take": False, "step": step, "reason": why}
    if not card.get("enabled", True):
        return no(1, "account switched off")
    if sig["swing"] != r["swing"]:
        return no(2, f"signal set {sig['swing']}: this account follows {r['swing']}")
    if sig["session"] not in r["sessions"]:
        return no(3, f"{sig['session']} isn't one of this account's sessions")
    if sig["dow"] in r["skipDays"]:
        return no(4, f"this account skips {sig['dow']}")
    window = r["windows"].get(sig["session"], 0)
    if not sig["mins_in"] < window:
        return no(5, f"{sig['mins_in']} min into {sig['session']}: window is {window}")
    entry, stop, long = sig["entry"], sig["stop"], sig["dir"] == "LONG"
    risk = abs(entry - stop)
    if sig["quiet"]:
        if r["quietMode"] == "skip":
            return no(6, "quiet market: this account skips quiet signals")
        target, min_reward = sig.get("quiet_target"), 0.0
        if target is None:
            return no(6, "quiet signal without a quiet target")
    else:
        target = sig.get("target")
        if target is None:
            return no(7, "no valid normal target")
        min_reward = r["minRR"] * risk
    if stats["inTrade"] or (is_flat is not None and not is_flat()):
        return no(8, "already in a trade (one at a time)")
    if stats["sessions"].get(sig["session"], 0) >= r["maxTradesSession"]:
        return no(9, f"already traded {sig['session']} today")
    day_target = card.get("maxDailyWin")
    day_loss = -abs(card.get("maxDailyLoss") or 500)
    if stats["tradesToday"] >= r["maxTradesDay"]:
        return no(10, f"{stats['tradesToday']} trades today (max {r['maxTradesDay']})")
    if stats["realized"] <= day_loss:
        return no(10, f"daily loss limit (${stats['realized']:,.2f} today)")
    if day_target is not None and stats["realized"] >= day_target:
        return no(10, f"daily target reached (${stats['realized']:,.2f} today)")
    if stats["losingDays"] >= r["weekRedDaysStop"]:
        return no(11, f"{stats['losingDays']} losing days this week")
    capped = False
    if day_target is not None:
        cap = entry + (day_target - stats["realized"]) / (card["contracts"] * 2) * (1 if long else -1)
        if (long and target > cap) or (not long and target < cap):
            target, capped = cap, True
    reward = abs(target - entry)
    if capped and reward < min_reward and reward < 0.5 * risk:
        return no(12, f"day target too close: {reward:.2f} pts left (needs {min_reward:.2f} or {0.5 * risk:.2f})")
    return {"take": True, "step": None, "reason": None, "target": rnd(target), "capped": capped}


def simulate_exit(trade, bars):
    """Dry run: the first 1-minute bar after the signal candle that reaches the stop or the target. Both in one bar = stop (as tested)."""
    long = trade["dir"] == "LONG"
    for b in bars:
        hit_stop = b["l"] <= trade["stop"] if long else b["h"] >= trade["stop"]
        hit_tgt = b["h"] >= trade["target"] if long else b["l"] <= trade["target"]
        if hit_stop:
            px = trade["stop"] - TICK if long else trade["stop"] + TICK  # a stop fills a tick worse
            return px, "stop", b["t"]
        if hit_tgt:
            return trade["target"], "target", b["t"]
    return None


def dry_pnl(trade, exit_px):
    pts = (exit_px - trade["entry"]) * (1 if trade["dir"] == "LONG" else -1)
    return round(pts * 2 * trade["qty"] - COMMISSION_PER_CONTRACT * trade["qty"], 2)


RECENT_PLACE = {}  # account id -> when this Mac last placed there (so a fresh bracket is never mistaken for a leftover)


def handle_signal(base, auth, ts, alert, ctx, now=None):
    """One SOR v2 signal: steps 1-12 per account, then the orders (or the dry run), then report every decision."""
    sig = alert["signal"]
    now = now or datetime.now(timezone.utc)
    results = []
    head = f"{sig['swing']} {sig['dir']} {sig['session']} {sig['dow']} +{sig['mins_in']}m{' quiet' if sig['quiet'] else ''} @ {sig['entry']}"
    if ctx.get("mode") not in ("live", "paper"):
        return
    if alert.get("ageMs", 0) > TICKET_TTL_MS:
        for c in ctx.get("cards", []):
            results.append({"cardId": c["id"], "status": "skipped", "step": 0, "reason": "signal too old (valid only on its own candle)", "qty": c["contracts"], "dry": c.get("dry", True)})
        return report(base, auth, alert, results, head)

    accts, contract, held = None, None, {}

    def topstep():
        nonlocal accts, contract
        if accts is None:
            accts = ts.accounts()
            contract = ts.mnq()
        return accts

    def position_of(acct_id):
        if acct_id not in held:
            held[acct_id] = ts.positions(acct_id)
        return held[acct_id]

    takes = []
    for c in ctx.get("cards", []):
        stats = card_stats(c.get("ledger", []), now)
        base_row = {"cardId": c["id"], "qty": c["contracts"], "dry": c.get("dry", True), "phase": c.get("phase")}
        m = None
        if not c.get("dry", True):
            try:
                m = match_account(topstep(), c.get("topstepAccountId"))
            except Exception as e:
                results.append({**base_row, "status": "error", "step": 8, "reason": f"couldn't reach TopstepX: {e}"})
                continue

        def flat():
            if c.get("dry", True):
                return True
            if not m:
                return True  # decided below: no account means no order
            return not position_of(m["id"])

        d = decide(sig, c, stats, flat)
        if not d["take"]:
            results.append({**base_row, "status": "skipped", "step": d["step"], "reason": d["reason"]})
            continue
        # The bot's own safety checks, after the spec's 12 (logged as step 13).
        why = None
        if c.get("newsRule") and news_block({"receivedAt": alert["receivedAt"]}, ctx):
            why = news_block({"receivedAt": alert["receivedAt"]}, ctx)
        elif not c.get("dry", True) and not m:
            why = f"Topstep account \"{c.get('topstepAccountId')}\" not found" if c.get("topstepAccountId") else "no Topstep account set on this card"
        elif not c.get("dry", True) and target_reached(c, m.get("balance")):
            why = "profit target reached: card switches off"
        elif not c.get("dry", True) and any(m["id"] == t[1]["id"] for t in takes if t[1]):
            why = "another card already trades this Topstep account"
        if why:
            results.append({**base_row, "status": "skipped", "step": 13, "reason": why})
            continue
        takes.append((c, m, d, base_row))
        c.setdefault("ledger", []).append({"status": "open", "enteredAt": now.isoformat(), "session": sig["session"], "pnl": None})

    # Topstep forbids hedging across accounts: if any watched account holds the other side, no live order anywhere.
    live = [t for t in takes if t[1]]
    if live:
        against = 2 if sig["dir"] == "LONG" else 1
        watched = {}
        for c in ctx.get("cards", []):
            mm = match_account(accts or [], c.get("topstepAccountId")) if not c.get("dry", True) else None
            if mm:
                watched[mm["id"]] = c["label"]
        opposite = []
        for aid, label in watched.items():
            try:
                if any(p.get("type") == against for p in position_of(aid)):
                    opposite.append(label)
            except Exception as e:
                log(f"Couldn't check {label} at Topstep ({e}); carrying on")
        if opposite:
            why = f"{', '.join(opposite)} still holds the other side: no live order, so nothing is hedged"
            for c, m, d, row in live:
                results.append({**row, "status": "skipped", "step": 13, "reason": why})
            takes = [t for t in takes if not t[1]]

    def place(t):
        c, m, d, row = t
        if c.get("dry", True):
            fill = sig["entry"] + (TICK if sig["dir"] == "LONG" else -TICK)  # as tested: entries fill a tick worse
            log(f"DRY RUN {sig['dir']} {c['contracts']} MNQ on {c['label']}: SL {sig['stop']} TP {d['target']}{' (capped)' if d['capped'] else ''}")
            return {**row, "status": "open", "fill": fill, "target": d["target"], "capped": d["capped"]}
        stop_ticks = max(1, round(abs(sig["entry"] - sig["stop"]) * TICKS_PER_POINT))
        target_ticks = max(1, round(abs(d["target"] - sig["entry"]) * TICKS_PER_POINT))
        tag = f"ltj-{alert['signalId'][4:14]}-{c['id'][-6:]}"
        try:
            RECENT_PLACE[m["id"]] = time.time()
            oid = ts.place(m["id"], contract, sig["dir"], c["contracts"], stop_ticks, target_ticks, tag)
            log(f"PLACED {sig['dir']} {c['contracts']} MNQ on {c['label']} (order {oid})")
        except Exception as e:  # rejected: logged, not retried, not counted
            log(f"FAILED {sig['dir']} on {c['label']}: {e}")
            return {**row, "status": "error", "step": None, "reason": str(e)[:400]}
        out = {**row, "status": "open", "orderId": oid, "target": d["target"], "capped": d["capped"]}
        try:
            fill, note = ts.snap(m["id"], contract, sig["dir"], sig["stop"], d["target"])
            log(f"  {c['label']}: {note}")
            if isinstance(fill, (int, float)) and fill > 0:
                out["fill"] = float(fill)
        except Exception as e:
            log(f"  {c['label']}: couldn't set SL/TP to the exact prices ({e}); bracket kept as placed")
        return out

    if takes:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results.extend(pool.map(place, takes))
    report(base, auth, alert, results, head)


def report(base, auth, alert, results, head):
    taken = [r for r in results if r["status"] == "open"]
    log(f"{head}: {len(taken)} taken ({sum(1 for r in taken if r.get('dry'))} dry run), {len(results)} accounts")
    for r in results:
        if r["status"] == "skipped":
            log(f"  skip {r['cardId'][-6:]} at step {r.get('step')}: {r.get('reason')}")
    post(base, auth, {"type": "results", "signalId": alert["signalId"], "results": results, "passed": []})


def watch(base, auth, ts, ctx, now=None, sweep=True):
    """Every loop: follow open trades to their close (dry run: on the 1-minute bars), clean up leftover orders, report the result."""
    now = now or datetime.now(timezone.utc)
    accts = None
    for t in ctx.get("openTrades", []):
        try:
            if t["dry"]:
                if t.get("target") is None:
                    continue
                start = iso(t["barTime"]) + timedelta(minutes=1) if t.get("barTime") else iso(t["enteredAt"]).replace(second=0, microsecond=0)
                if now - start < timedelta(minutes=1):
                    continue
                bars = ts.bars(ts.mnq(), start.isoformat(), now.isoformat())
                hit = simulate_exit(t, [b for b in bars if iso(b["t"]) >= start])
                if hit:
                    px, why, at = hit
                    post(base, auth, {"type": "closed", "tradeId": t["id"], "exitPrice": px, "pnl": dry_pnl(t, px), "fees": 0, "reason": why, "exitedAt": iso(at).isoformat()})
                continue
            if now - iso(t["enteredAt"]) < timedelta(seconds=25):
                continue
            accts = accts if accts is not None else ts.accounts()
            m = match_account(accts, t.get("account"))
            if not m or ts.positions(m["id"]):
                continue
            # Flat: the bracket (or Topstep, or you) closed it. Its P&L from Topstep, then nothing left behind.
            since = (iso(t["enteredAt"]) - timedelta(minutes=2)).isoformat()
            fills = ts.trades(m["id"], since)
            closing = [f for f in fills if f.get("profitAndLoss") is not None]
            pnl = sum(f["profitAndLoss"] for f in closing) - sum(f.get("fees") or 0 for f in fills)
            px = closing[-1]["price"] if closing else None
            reason = "other"
            if px is not None and abs(px - t["stop"]) <= 1:
                reason = "stop"
            elif px is not None and t.get("target") is not None and abs(px - t["target"]) <= 1:
                reason = "target"
            cleanup(ts, m, t.get("label", ""))
            post(base, auth, {"type": "closed", "tradeId": t["id"], "exitPrice": px, "pnl": round(pnl, 2), "fees": round(sum(f.get("fees") or 0 for f in fills), 2), "reason": reason, "exitedAt": now.isoformat()})
        except Exception as e:
            log(f"Couldn't check open trade on {t.get('label', '')} ({e}); trying again next time")
    # Leftover orders on a flat account (e.g. it closed while TradingView or the journal was down) never get to open a new position.
    if not sweep:  # Autopilot is Off: leave the accounts alone beyond the bot's own open trades
        return
    open_cards = {t["cardId"] for t in ctx.get("openTrades", [])}
    for c in ctx.get("cards", []):
        if c.get("dry", True) or c["id"] in open_cards:
            continue
        try:
            accts = accts if accts is not None else ts.accounts()
            m = match_account(accts, c.get("topstepAccountId"))
            if m and time.time() - RECENT_PLACE.get(m["id"], 0) > 30 and not ts.positions(m["id"]):
                cleanup(ts, m, c["label"])
        except Exception as e:
            log(f"Couldn't check {c['label']} for leftover orders ({e})")


def cleanup(ts, m, label):
    for o in ts.open_orders(m["id"]):
        try:
            ts.cancel(m["id"], o["id"])
            log(f"CLEAN-UP {label}: cancelled leftover order {o['id']}")
        except Exception as e:
            log(f"CLEAN-UP {label}: couldn't cancel order {o['id']} ({e})")


def run():
    cfg = load_config()
    base = cfg["url"].rstrip("/")
    auth = {"Authorization": "Bearer " + cfg["token"], "X-Runner": f"{platform.node()[:40]} - bot {VERSION}"}
    ts = Topstep(cfg["user"], cfg["key"])
    log(f"Autopilot bot {VERSION} started for {base}")
    last_accounts = 0
    last_watch = 0
    last_ready = 0
    failures = 0
    while True:
        try:
            code, d = http("GET", base + "/api/bot/runner", headers=auth, timeout=35)
            if code == 401:
                log("The journal turned this Mac away: make a new key in Autopilot and run setup again.")
                time.sleep(60)
                continue
            if code != 200:
                raise RuntimeError(f"journal answered {code}")
            failures = 0
            ctx = d.get("context") or {}
            for alert in d.get("alerts", []):
                if alert.get("signal"):
                    handle_signal(base, auth, ts, alert, ctx)
                else:
                    handle(base, auth, ts, alert, ctx)
            # Open trades are followed to their close even with Autopilot switched Off (Off only stops new entries).
            on = ctx.get("mode") in ("live", "paper")
            if ctx.get("openTrades") or (on and time.time() - last_watch > 60):
                watch(base, auth, ts, ctx, sweep=on)
                last_watch = time.time()
            # Your accounts and balances for the journal (and the profit targets): at start, after exits, and every 10 minutes.
            if ctx.get("balancesDue") or time.time() - last_accounts > 600:
                send_accounts(base, auth, ts, ctx)
                last_accounts = time.time()
            # Each time a session window opens (the journal stops telling it to nap), check everything once.
            if int(d.get("wait", 0)) == 0 and time.time() - last_ready > 3 * 3600:
                problems, summary = readiness(ts, ctx)
                post(base, auth, {"type": "ready", "problems": problems, "summary": summary})
                for p_ in problems:
                    log(f"NOT READY: {p_}")
                last_ready = time.time()
            elif int(d.get("wait", 0)) > 300:
                last_ready = 0  # napping between sessions: check again when the next one opens
            wait = int(d.get("wait", 0))
            if wait > 0:
                time.sleep(min(wait, 900))
        except KeyboardInterrupt:
            log("Stopped.")
            return
        except Exception as e:
            failures += 1
            log(f"Connection problem ({e}); retrying")
            time.sleep(min(30, 2 * failures))


def readiness(ts, ctx):
    """Everything a real signal needs, checked before it comes: problems (plain words) and a one-line summary."""
    problems = []
    if ctx.get("mode") != "live":
        problems.append(f"Autopilot is {ctx.get('mode', 'off').upper()}, not LIVE: no real orders will be placed")
    cards = ctx.get("cards", [])
    live = [c for c in cards if not c.get("dry", True)]
    if not cards:
        problems.append("no account card is switched on")
    elif not live:
        problems.append("every card is on Dry run: no real orders will be placed")
    try:
        accts = ts.accounts()
        ts.mnq()
    except Exception as e:
        problems.append(f"your Mac can't reach TopstepX ({e})")
        accts = []
    for c in live:
        m = match_account(accts, c.get("topstepAccountId"))
        if not m:
            problems.append(f"{c['label']}: Topstep account \"{c.get('topstepAccountId') or 'none set'}\" not found")
        elif m.get("canTrade") is False:
            problems.append(f"{c['label']}: Topstep says this account can't trade right now")
    summary = f"{len(live)} {'card' if len(live) == 1 else 'cards'} on real orders ({', '.join(c['label'] + ' ' + str(c['contracts']) + ' MNQ' for c in live) or 'none'}), TopstepX reachable"
    return problems, summary


def send_accounts(base, auth, ts, ctx):
    try:
        accts = ts.accounts()
    except Exception as e:
        log(f"Couldn't read your TopstepX accounts: {e}")
        return
    balances, passed = [], []
    for card in ctx.get("cards", []):
        m = match_account(accts, card.get("topstepAccountId"))
        if m and m.get("balance") is not None:
            balances.append({"cardId": card["id"], "balance": m["balance"]})
            if target_reached(card, m["balance"]):
                passed.append({"cardId": card["id"], "profit": m["balance"] - card["startBalance"]})
    body = {
        "type": "accounts",
        "accounts": [{"id": a["id"], "name": a.get("name", ""), "balance": a.get("balance"), "canTrade": a.get("canTrade", True) is not False} for a in accts],
        "balances": balances,
        "passed": passed,
    }
    post(base, auth, body)
    for p in passed:
        log(f"Profit target reached on card {p['cardId']}: the journal switches it off")


def handle(base, auth, ts, alert, ctx):
    """One live entry: every rule, then the orders, then tell the journal what happened."""
    cards = ctx.get("cards", [])
    results, passed = [], []

    def skip(card, why, status="skipped"):
        results.append({"cardId": card["id"], "status": status, "reason": why, "qty": card["contracts"]})

    head = f"{alert['dir']}{' (quiet)' if alert.get('quiet') else ''} @ ~{alert['price']} SL {alert['stop']} TP {alert['target']}"
    if ctx.get("mode") != "live":
        for c in cards:
            skip(c, "Autopilot isn't on Live")
        return finish(base, auth, alert, results, passed, head)
    if alert.get("ageMs", 0) > TICKET_TTL_MS:
        for c in cards:
            skip(c, "signal too old to place safely", "error")
        return finish(base, auth, alert, results, passed, head)

    news = news_block(alert, ctx)
    bad = bracket_problem(alert["dir"], alert["price"], alert["stop"], alert["target"])
    stop_ticks = max(1, round(abs(alert["price"] - alert["stop"]) * TICKS_PER_POINT))
    target_ticks = max(1, round(abs(alert["target"] - alert["price"]) * TICKS_PER_POINT))

    live = []
    for c in cards:
        why = phase_skip(c, alert)
        if why:
            skip(c, why)
        else:
            live.append(c)
    if news:
        for c in [c for c in live if c.get("newsRule", True)]:
            skip(c, news)
        live = [c for c in live if not c.get("newsRule", True)]
    if bad:
        for c in live:
            skip(c, f"bad bracket: {bad}")
        live = []
    still = []
    for c in live:
        why = day_gate(c)
        if why:
            skip(c, why)
        else:
            still.append(c)
    live = still
    if not live:
        return finish(base, auth, alert, results, passed, head)

    try:
        accts = ts.accounts()
        contract = ts.mnq()
    except Exception as e:
        for c in live:
            skip(c, f"couldn't reach TopstepX: {e}", "error")
        return finish(base, auth, alert, results, passed, head)

    go, used = [], set()
    for c in live:
        m = match_account(accts, c.get("topstepAccountId"))
        if not m:
            skip(c, f"Topstep account \"{c.get('topstepAccountId')}\" not found" if c.get("topstepAccountId") else "no Topstep account set on this card")
            continue
        if m["id"] in used:
            skip(c, "another card already traded this Topstep account")
            continue
        used.add(m["id"])
        if target_reached(c, m.get("balance")):
            passed.append({"cardId": c["id"], "profit": m["balance"] - c["startBalance"]})
            skip(c, "profit target reached, card switched off")
            continue
        go.append((c, m))

    if go:
        # Hedge guard: every account the cards point at, checked at once. Anyone holding the
        # opposite side → skip everywhere (long here while short there is hedging). Same side → that one sits out.
        watched = {}
        for c in cards:
            m = match_account(accts, c.get("topstepAccountId"))
            if m:
                watched[m["id"]] = c["label"]
        held = {}
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {aid: pool.submit(ts.positions, aid) for aid in watched}
            for aid, f in futures.items():
                try:
                    held[aid] = f.result()
                except Exception as e:
                    log(f"Couldn't check {watched[aid]} at Topstep ({e}); carrying on")
        against = 2 if alert["dir"] == "LONG" else 1  # ProjectX position type: 1 long, 2 short
        opposite = [watched[aid] for aid, ps in held.items() if any(p.get("type") == against for p in ps)]
        if opposite:
            why = f"{', '.join(opposite)} still {'short' if alert['dir'] == 'LONG' else 'long'} at Topstep: skipped on every account so nothing is hedged"
            for c, _ in go:
                skip(c, why)
            go = []
        else:
            busy = [(c, m) for c, m in go if held.get(m["id"])]
            for c, _ in busy:
                skip(c, "still in a trade at Topstep (not flat)")
            go = [(c, m) for c, m in go if not held.get(m["id"])]

    def place(cm):
        c, m = cm
        tag = f"ltj-{alert['signalId'][4:14]}-{c['id'][-6:]}"
        try:
            oid = ts.place(m["id"], contract, alert["dir"], c["contracts"], stop_ticks, target_ticks, tag)
            log(f"PLACED {alert['dir']} {c['contracts']} MNQ on {c['label']} (order {oid})")
            fill = None
            try:
                fill, note = ts.snap(m["id"], contract, alert["dir"], alert["stop"], alert["target"])
                log(f"  {c['label']}: {note}")
            except Exception as e:  # the bracket is still on, just at the fill's distance
                log(f"  {c['label']}: couldn't move SL/TP to the script's prices ({e}); bracket kept as placed")
            out = {"cardId": c["id"], "status": "open", "orderId": oid, "qty": c["contracts"]}
            if isinstance(fill, (int, float)) and fill > 0:
                out["fill"] = float(fill)
            return out
        except Exception as e:
            log(f"FAILED {alert['dir']} on {c['label']}: {e}")
            return {"cardId": c["id"], "status": "error", "reason": str(e)[:400], "qty": c["contracts"]}

    if go:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results.extend(pool.map(place, go))
    finish(base, auth, alert, results, passed, head)


def finish(base, auth, alert, results, passed, head):
    log(f"{head}: {sum(1 for r in results if r['status'] == 'open')} placed, {len(results)} cards")
    post(base, auth, {"type": "results", "signalId": alert["signalId"], "results": results, "passed": passed})


def post(base, auth, body):
    for attempt in range(4):
        try:
            code, _ = http("POST", base + "/api/bot/runner", body, auth)
            if code == 200:
                return
        except Exception:
            pass
        time.sleep(1 + attempt)
    log("Couldn't report back to the journal (check the book)")


def setup():
    print("Thunder Autopilot setup. Your details are saved only on this Mac.\n")
    url = input("Journal address [https://lord-thundercunts-journal.vercel.app]: ").strip() or "https://lord-thundercunts-journal.vercel.app"
    token = getpass.getpass("Runner key from Autopilot (starts ltjr_, hidden as you paste): ").strip()
    user = input("TopstepX username: ").strip()
    key = getpass.getpass("TopstepX API key (hidden as you paste): ").strip()
    print("\nChecking…")
    try:
        Topstep(user, key).login()
        print("  ✓ TopstepX login works")
    except Exception as e:
        sys.exit(f"  ✗ {e}")
    code, _ = http("GET", url.rstrip("/") + "/api/bot/runner", headers={"Authorization": "Bearer " + token, "X-Runner": f"{platform.node()[:40]} - setup"}, timeout=35)
    if code != 200:
        sys.exit(f"  ✗ The journal didn't accept the runner key ({code}). Make a new one in Autopilot and try again.")
    print("  ✓ Connected to your journal")
    with open(CONFIG, "w") as f:
        json.dump({"url": url, "token": token, "user": user, "key": key}, f)
    os.chmod(CONFIG, 0o600)
    print(f"\nSaved to {CONFIG} (only you can read it).\nNext:  python3 autopilot-runner.py install")


def install():
    load_config()
    os.makedirs(APP_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(PLIST), exist_ok=True)
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    target = os.path.join(APP_DIR, "autopilot-runner.py")
    shutil.copyfile(os.path.abspath(__file__), target)
    py = sys.executable or "/usr/bin/python3"
    # caffeinate keeps the Mac awake (not the screen) for as long as the runner is running.
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-is</string>
    <string>{py}</string><string>{target}</string><string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{LOG}</string>
  <key>StandardErrorPath</key><string>{LOG}</string>
</dict></plist>
"""
    subprocess.run(["launchctl", "unload", PLIST], capture_output=True)
    with open(PLIST, "w") as f:
        f.write(plist)
    subprocess.run(["launchctl", "load", PLIST], check=True)
    print("✓ Installed and running. It starts by itself whenever you log in, and keeps the Mac awake.")
    print(f"  Log: {LOG}\n  Check the journal: Autopilot should say your Mac is connected within a minute.")


def test():
    """A test LONG at the live MNQ price, 20 point stop, 15 point target, sent through the journal like a real signal.
    Cards on Dry run only log it; a card on Real orders places it (close it straight after in TopstepX)."""
    cfg = load_config()
    base = cfg["url"].rstrip("/")
    auth = {"Authorization": "Bearer " + cfg["token"], "X-Runner": f"{platform.node()[:40]} - bot {VERSION}"}
    ts = Topstep(cfg["user"], cfg["key"])
    now = datetime.now(timezone.utc)
    bars = ts.bars(ts.mnq(), (now - timedelta(minutes=30)).isoformat(), now.isoformat())
    if not bars:
        print("Couldn't read the MNQ price from TopstepX (market closed?). Nothing sent.")
        return
    price = rnd(bars[-1]["c"])
    body = {"type": "test", "dir": "LONG", "entry": price, "stop": price - 20, "target": price + 15}
    code, d = http("POST", base + "/api/bot/runner", body, auth)
    if code != 200:
        print(f"The journal said no ({code}). Is your Mac paired? Nothing sent.")
        return
    print(f"Test sent: LONG @ {price} · SL {price - 20} · TP {price + 15}")
    print("Watch Autopilot → Log (and TopstepX, for any card on Real orders). Your Mac picks it up within a few seconds")
    print("if the bot is running and it's within 5 minutes of a session or during one.")


def status():
    r = subprocess.run(["launchctl", "list"], capture_output=True, text=True)
    running = LABEL in r.stdout
    print("Running ✓" if running else "Not running")
    if os.path.exists(LOG):
        with open(LOG) as f:
            lines = f.readlines()[-8:]
        print("".join(lines))


def uninstall():
    subprocess.run(["launchctl", "unload", PLIST], capture_output=True)
    for p in (PLIST,):
        if os.path.exists(p):
            os.remove(p)
    print("Stopped and removed. (Your saved details are in ~/.thunder-autopilot.json: delete it too if you want.)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    {"setup": setup, "install": install, "run": run, "status": status, "test": test, "uninstall": uninstall}.get(cmd, lambda: print(__doc__))()
