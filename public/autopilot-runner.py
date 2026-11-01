#!/usr/bin/env python3
"""
Thunder Autopilot: home runner.

Topstep wants every order to come from your own computer. Your journal decides
(every rule: on/off, news, limits, targets, hedge checks); this program, on your
Mac, collects each order ticket and places it at TopstepX from here, then
reports back. It can only log in and place a bracketed market order; it never
cancels, changes settings or touches anything else.

  python3 autopilot-runner.py setup      # once: saves your details (only on this Mac)
  python3 autopilot-runner.py install    # starts it now and every time you log in, keeps the Mac awake
  python3 autopilot-runner.py status     # is it running?
  python3 autopilot-runner.py uninstall  # stop it and remove it
  python3 autopilot-runner.py run        # run in this window instead (Ctrl+C to stop)

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
import urllib.error
import urllib.request
from datetime import datetime

VERSION = "1.0"
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
    """Only two calls: log in, and place one bracketed market order."""

    def __init__(self, user, key):
        self.user, self.key, self.token, self.at = user, key, None, 0

    def login(self):
        if self.token and time.time() - self.at < 20 * 60:
            return self.token
        code, d = http("POST", TOPSTEP + "/api/Auth/loginKey", {"userName": self.user, "apiKey": self.key})
        if code != 200 or not d.get("success") or not d.get("token"):
            raise RuntimeError(f"TopstepX login failed ({code}: {d.get('errorMessage') or d.get('errorCode') or 'check username and API key'})")
        self.token, self.at = d["token"], time.time()
        return self.token

    def place(self, t):
        # One atomic market order with its stop and target attached at Topstep (OCO).
        # Bracket ticks are signed from the fill: long = stop below (negative), target above.
        sign = 1 if t["dir"] == "LONG" else -1
        order = {
            "accountId": t["accountId"],
            "contractId": t["contractId"],
            "type": 2,
            "side": 0 if t["dir"] == "LONG" else 1,
            "size": t["size"],
            "customTag": t["tag"],
            "stopLossBracket": {"ticks": -t["stopTicks"] * sign, "type": 4},
            "takeProfitBracket": {"ticks": t["targetTicks"] * sign, "type": 1},
        }
        code, d = http("POST", TOPSTEP + "/api/Order/place", order, {"Authorization": "Bearer " + self.login()})
        if code == 401:  # token expired early: log in again once
            self.token = None
            code, d = http("POST", TOPSTEP + "/api/Order/place", order, {"Authorization": "Bearer " + self.login()})
        if code != 200 or not d.get("success"):
            raise RuntimeError(f"order rejected ({code}: {d.get('errorMessage') or d.get('errorCode') or 'no reason given'})")
        return str(d.get("orderId", ""))


def run():
    cfg = load_config()
    base = cfg["url"].rstrip("/")
    auth = {"Authorization": "Bearer " + cfg["token"], "X-Runner": f"{platform.node()[:40]} · runner {VERSION}"}
    ts = Topstep(cfg["user"], cfg["key"])
    log(f"Autopilot runner {VERSION} started for {base}")
    try:
        ts.login()
        log("TopstepX login OK")
    except Exception as e:
        log(f"WARNING: {e}")
    failures = 0
    while True:
        try:
            code, d = http("GET", base + "/api/bot/runner", headers=auth, timeout=35)
            if code == 401:
                log("The journal turned this Mac away: make a new runner key in Autopilot and run setup again.")
                time.sleep(60)
                continue
            if code != 200:
                raise RuntimeError(f"journal answered {code}")
            failures = 0
            for t in d.get("orders", []):
                handle(base, auth, ts, t)
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


def handle(base, auth, ts, t):
    if t.get("ageMs", 0) > TICKET_TTL_MS:
        report(base, auth, t["id"], False, error="ticket was too old to place safely")
        return
    try:
        oid = ts.place(t)
        log(f"PLACED {t['dir']} {t['size']} MNQ on account {t['accountId']} (order {oid})")
        report(base, auth, t["id"], True, order_id=oid)
    except Exception as e:
        log(f"FAILED {t['dir']} on account {t['accountId']}: {e}")
        report(base, auth, t["id"], False, error=str(e)[:400])


def report(base, auth, tid, ok, order_id=None, error=None):
    body = {"id": tid, "ok": ok}
    if order_id:
        body["orderId"] = order_id
    if error:
        body["error"] = error
    for attempt in range(4):
        try:
            code, _ = http("POST", base + "/api/bot/runner", body, auth)
            if code == 200:
                return
        except Exception:
            pass
        time.sleep(1 + attempt)
    log(f"Couldn't report ticket {tid} back to the journal (check the book)")


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
    code, _ = http("GET", url.rstrip("/") + "/api/bot/runner", headers={"Authorization": "Bearer " + token, "X-Runner": f"{platform.node()[:40]} · setup"}, timeout=35)
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
