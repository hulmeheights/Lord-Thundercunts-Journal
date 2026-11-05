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
import urllib.error
import urllib.request
from datetime import datetime

VERSION = "2.3"
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


def run():
    cfg = load_config()
    base = cfg["url"].rstrip("/")
    auth = {"Authorization": "Bearer " + cfg["token"], "X-Runner": f"{platform.node()[:40]} - bot {VERSION}"}
    ts = Topstep(cfg["user"], cfg["key"])
    log(f"Autopilot bot {VERSION} started for {base}")
    last_accounts = 0
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
                handle(base, auth, ts, alert, ctx)
            # Your accounts and balances for the journal (and the profit targets): at start, after exits, and every 10 minutes.
            if ctx.get("balancesDue") or time.time() - last_accounts > 600:
                send_accounts(base, auth, ts, ctx)
                last_accounts = time.time()
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
    {"setup": setup, "install": install, "run": run, "status": status, "uninstall": uninstall}.get(cmd, lambda: print(__doc__))()
