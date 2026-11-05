"""
Mac bot (public/autopilot-runner.py), MNQ SOR v2: the spec's "Testing before live", stage 1 and 2.
Run: python3 -m unittest tests/test_autopilot_runner.py -v
"""
import csv
import importlib.util
import os
import unittest
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("runner", os.path.join(HERE, "..", "public", "autopilot-runner.py"))
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)

EVAL_RULES = {"swing": "3/3", "sessions": ["NYAM", "NYPM", "LON"], "skipDays": ["Thu"], "windows": {"NYAM": 90, "NYPM": 90, "LON": 120, "ASIA": 120}, "quietMode": "target15", "minRR": 1.8, "maxTradesDay": 4, "maxTradesSession": 1, "weekRedDaysStop": 2}
FUNDED_RULES = {"swing": "3/2", "sessions": ["NYAM", "NYPM", "LON", "ASIA"], "skipDays": [], "windows": {"NYAM": 150, "NYPM": 150, "LON": 150, "ASIA": 150}, "quietMode": "skip", "minRR": 1.8, "maxTradesDay": 4, "maxTradesSession": 1, "weekRedDaysStop": 2}


def card(phase):
    return {"id": f"ba_{phase}", "label": phase, "enabled": True, "contracts": 5, "maxDailyWin": 1600, "maxDailyLoss": 500, "phase": phase, "rules": dict(EVAL_RULES if phase == "eval" else FUNDED_RULES)}


def stats(realized=0.0, trades=0, sessions=None, losing=0, in_trade=False):
    return {"realized": realized, "tradesToday": trades, "sessions": sessions or {}, "losingDays": losing, "inTrade": in_trade}


def sig(**k):
    s = {"swing": "3/3", "session": "LON", "dow": "Tue", "mins_in": 47, "quiet": False, "dir": "LONG", "entry": 28000.0, "stop": 27980.0, "target": 28100.0, "quiet_target": None, "id": "x"}
    s.update(k)
    return s


EX1 = dict(swing="3/3", session="LON", dow="Tue", mins_in=47, quiet=True, dir="LONG", entry=28000.0, stop=27980.0, target=None, quiet_target=28015.0)
EX3 = dict(swing="3/2", session="ASIA", dow="Wed", mins_in=30, quiet=False, dir="SHORT", entry=28500.0, stop=28540.0, target=28400.0)
EX9 = dict(swing="3/2", session="LON", dow="Tue", mins_in=20, quiet=False, dir="LONG", entry=29000.0, stop=28970.0, target=29120.0)


class WorkedExamples(unittest.TestCase):
    """Spec: Worked examples 1-13 (5 contracts, flat, no limits hit unless stated)."""

    def test_01_eval_quiet_uses_quiet_target(self):
        d = R.decide(sig(**EX1), card("eval"), stats())
        self.assertEqual((d["take"], d["target"], d["capped"]), (True, 28015.0, False))

    def test_02_funded_follows_32_only(self):
        self.assertEqual(R.decide(sig(**EX1), card("funded"), stats())["step"], 2)

    def test_03_funded_asia_short_not_capped(self):
        d = R.decide(sig(**EX3), card("funded"), stats())
        self.assertEqual((d["take"], d["target"], d["capped"]), (True, 28400.0, False))  # cap 28,340 is further

    def test_04_eval_follows_33_only(self):
        self.assertEqual(R.decide(sig(**EX3), card("eval"), stats())["step"], 2)

    def test_05_funded_skips_quiet(self):
        d = R.decide(sig(swing="3/2", session="NYAM", dow="Mon", mins_in=20, quiet=True, target=None, quiet_target=28015.0), card("funded"), stats())
        self.assertEqual(d["step"], 6)

    def test_06_eval_skips_thursday(self):
        self.assertEqual(R.decide(sig(session="NYPM", dow="Thu", mins_in=10), card("eval"), stats())["step"], 4)

    def test_07_eval_ny_window_90(self):
        self.assertEqual(R.decide(sig(session="NYAM", dow="Fri", mins_in=100), card("eval"), stats())["step"], 5)

    def test_08_funded_window_150_continues(self):
        d = R.decide(sig(swing="3/2", session="NYAM", dow="Fri", mins_in=100), card("funded"), stats())
        self.assertTrue(d["take"] or d["step"] > 5)
        self.assertTrue(d["take"])

    def test_09_capped_but_over_half_r(self):
        d = R.decide(sig(**EX9), card("funded"), stats(realized=1200))
        self.assertEqual((d["take"], d["target"], d["capped"]), (True, 29040.0, True))

    def test_10_capped_too_close(self):
        self.assertEqual(R.decide(sig(**EX9), card("funded"), stats(realized=1500))["step"], 12)

    def test_11_two_losing_days_this_week(self):
        # Lost Monday and Tuesday (trading days); now Wednesday 10:00 New York.
        now = datetime(2026, 11, 4, 15, 0, tzinfo=timezone.utc)
        ledger = [
            {"status": "closed", "enteredAt": "2026-11-02T14:40:00Z", "exitedAt": "2026-11-02T15:00:00Z", "session": "NYAM", "pnl": -300},
            {"status": "closed", "enteredAt": "2026-11-03T14:40:00Z", "exitedAt": "2026-11-03T15:00:00Z", "session": "NYAM", "pnl": -250},
        ]
        st = R.card_stats(ledger, now)
        self.assertEqual(st["losingDays"], 2)
        self.assertEqual(R.decide(sig(swing="3/2", dow="Wed"), card("funded"), st)["step"], 11)

    def test_12_in_a_trade(self):
        self.assertEqual(R.decide(sig(swing="3/2"), card("funded"), stats(), is_flat=lambda: False)["step"], 8)
        self.assertEqual(R.decide(sig(swing="3/2"), card("funded"), stats(in_trade=True))["step"], 8)

    def test_13_second_signal_in_london(self):
        now = datetime(2026, 11, 3, 10, 30, tzinfo=timezone.utc)  # 05:30 New York
        ledger = [{"status": "closed", "enteredAt": "2026-11-03T08:52:00Z", "exitedAt": "2026-11-03T09:30:00Z", "session": "LON", "pnl": 120}]
        self.assertEqual(R.decide(sig(swing="3/2"), card("funded"), R.card_stats(ledger, now))["step"], 9)


class TimeAndRounding(unittest.TestCase):
    def test_trading_day_rolls_at_1800_new_york(self):
        self.assertEqual(str(R.trading_date(datetime(2026, 11, 5, 22, 59, tzinfo=timezone.utc))), "2026-11-05")  # 17:59 EST
        self.assertEqual(str(R.trading_date(datetime(2026, 11, 5, 23, 0, tzinfo=timezone.utc))), "2026-11-06")  # 18:00 EST
        self.assertEqual(str(R.trading_date(datetime(2026, 10, 29, 21, 59, tzinfo=timezone.utc))), "2026-10-29")  # 17:59 EDT
        self.assertEqual(str(R.trading_date(datetime(2026, 10, 29, 22, 0, tzinfo=timezone.utc))), "2026-10-30")

    def test_sunday_evening_is_monday(self):
        self.assertEqual(str(R.trading_date(datetime(2026, 11, 8, 23, 30, tzinfo=timezone.utc))), "2026-11-09")  # Sun 18:30 NY

    def test_week_resets_sunday_1800(self):
        # Lost Thursday and Friday; Sunday 18:30 New York is a new week, so nothing carries over.
        ledger = [
            {"status": "closed", "enteredAt": "2026-11-05T14:40:00Z", "exitedAt": "2026-11-05T15:00:00Z", "session": "NYAM", "pnl": -300},
            {"status": "closed", "enteredAt": "2026-11-06T14:40:00Z", "exitedAt": "2026-11-06T15:00:00Z", "session": "NYAM", "pnl": -300},
        ]
        self.assertEqual(R.card_stats(ledger, datetime(2026, 11, 6, 20, 0, tzinfo=timezone.utc))["losingDays"], 1)  # Fri afternoon: Thu counts
        self.assertEqual(R.card_stats(ledger, datetime(2026, 11, 8, 23, 30, tzinfo=timezone.utc))["losingDays"], 0)

    def test_trade_open_over_the_roll_counts_on_the_day_it_closes(self):
        ledger = [{"status": "closed", "enteredAt": "2026-11-04T22:50:00Z", "exitedAt": "2026-11-04T23:20:00Z", "session": "OTHER", "pnl": -200}]
        st = R.card_stats(ledger, datetime(2026, 11, 5, 1, 0, tzinfo=timezone.utc))  # Thursday's trading day
        self.assertEqual(st["realized"], -200)

    def test_targets_round_to_quarter(self):
        self.assertEqual(R.rnd(28040.1), 28040.0)
        self.assertEqual(R.rnd(28040.125), 28040.25)  # halves round up
        self.assertEqual(R.rnd(28040.37), 28040.25)
        d = R.decide(sig(**EX9), card("funded"), stats(realized=1123.45))  # 476.55 left = 47.655 pts
        self.assertEqual((d["target"], d["capped"]), (29047.75, True))


class DryRun(unittest.TestCase):
    def test_simulated_exit_stop_first_and_pnl_as_tested(self):
        t = {"dir": "SHORT", "entry": 30744.5, "stop": 30760.75, "target": 30729.75, "qty": 5}
        bars = [{"t": "a", "h": 30750, "l": 30735}, {"t": "b", "h": 30761, "l": 30729}]  # both in one bar → stop
        px, why, _ = R.simulate_exit(t, bars)
        self.assertEqual((px, why), (30761.0, "stop"))
        self.assertEqual(R.dry_pnl(t, px), -171.2)  # the expected-trades file's first eval row
        t2 = {"dir": "SHORT", "entry": 30675.5, "stop": 30708.5, "target": 30587.0, "qty": 5}
        self.assertEqual(R.dry_pnl(t2, 30587.0), 878.8)


def ny(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=R.NY).astimezone(timezone.utc)


DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def replay(signals, c):
    """Stage 2: recorded signals (with how each trade ended) through the same decision code, ledger rebuilt each time."""
    ledger, out = [], []
    for s in signals:
        now = s["at"]
        # close anything that has ended by now
        for r in ledger:
            if r["status"] == "open" and r["_exit"] <= now:
                r.update(status="closed", exitedAt=r["_exit"].isoformat(), pnl=r["_pnl"])
        d = R.decide(s, c, R.card_stats(ledger, now))
        out.append((s["id"], d["take"], d.get("step"), d.get("target"), d.get("capped")))
        if d["take"]:
            ledger.append({"status": "open", "enteredAt": now.isoformat(), "session": s["session"], "pnl": None, "_exit": s["exit_at"], "_pnl": s["pnl"]})
    return out


def expected_signals(mode):
    with open(os.path.join(HERE, "fixtures", "expected-trades-2026-09-21-to-11-04.csv")) as f:
        rows = [r for r in csv.DictReader(f) if r["mode"] == mode]
    out = []
    for r in rows:
        long = r["dir"] == "LONG"
        fill = float(r["entry_fill"])
        entry = fill - R.TICK if long else fill + R.TICK  # the file's fills are a tick worse than the signal candle's close
        quiet, capped = r["quiet"] == "True", r["capped"] == "True"
        target = float(r["target"])
        far = entry + 500 if long else entry - 500  # a capped trade's original target lay beyond the cap
        at = ny(r["time_NY"])
        out.append({
            "swing": "3/3" if mode == "eval" else "3/2", "session": r["session"], "dow": DOW[datetime.strptime(r["trading_day"], "%Y-%m-%d").weekday()], "mins_in": 10,
            "quiet": quiet, "dir": r["dir"], "entry": entry, "stop": float(r["stop"]),
            "target": None if quiet else (far if capped else target), "quiet_target": (far if capped else target) if quiet else None,
            "id": f"{r['time_NY']}-{mode}", "at": at, "exit_at": at + timedelta(minutes=30), "pnl": float(r["pnl_usd"]),
            "_want_target": target, "_want_capped": capped,
        })
    return out


def expected_signals_2yr(mode):
    """Expected_Trades_2yr_Nov2024_Nov2026.csv: real entry and exit times (UK), weekday and result for every trade."""
    with open(os.path.join(HERE, "fixtures", "expected-trades-2024-11-to-2026-11.csv")) as f:
        rows = [r for r in csv.DictReader(f) if r["mode"] == mode]
    uk = lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=R.ZoneInfo("Europe/London")).astimezone(timezone.utc)
    out = []
    for r in rows:
        long = r["dir"] == "LONG"
        fill = float(r["entry_fill"])
        entry = fill - R.TICK if long else fill + R.TICK
        quiet, capped, target = r["quiet"] == "True", r["capped"] == "True", float(r["target"])
        far = entry + 500 if long else entry - 500
        out.append({
            "swing": "3/3" if mode == "eval" else "3/2", "session": r["session"], "dow": r["weekday"], "mins_in": 10, "quiet": quiet, "dir": r["dir"], "entry": entry, "stop": float(r["stop"]),
            "target": None if quiet else (far if capped else target), "quiet_target": (far if capped else target) if quiet else None,
            "id": f"{r['entry_time_UK']}-{mode}", "at": uk(r["entry_time_UK"]), "exit_at": uk(r["exit_time_UK"]), "pnl": float(r["pnl_usd"]), "_want_target": target, "_want_capped": capped,
        })
    return out


class ReplayAndExpectedTrades(unittest.TestCase):
    def test_two_years_of_expected_trades(self):
        """All 721 trades of the 2-year backtest through steps 1-12 with their real exits. The one known difference: a funded trade
        that closed exactly at Sunday 18:00 New York (the reopen) counts on Monday here; the backtest counted it on Friday."""
        known = {"2026-02-02 08:59-funded"}
        diffs = []
        for mode in ("eval", "funded"):
            sigs = expected_signals_2yr(mode)
            for s, (sid, take, step, target, capped) in zip(sigs, replay(sigs, card(mode))):
                if not take:
                    diffs.append(f"{sid}: skipped at step {step}")
                elif abs(target - s["_want_target"]) > 0.25 or capped != s["_want_capped"]:
                    diffs.append(f"{sid}: target {target} capped {capped}, expected {s['_want_target']} capped {s['_want_capped']}")
        self.assertEqual([d for d in diffs if d.split(": ")[0] not in known], [])

    def test_replay_is_deterministic(self):
        sigs = expected_signals("funded")
        self.assertEqual(replay(sigs, card("funded")), replay(sigs, card("funded")))

    def test_expected_trades_are_all_taken_with_the_same_targets(self):
        """Every trade in Expected_Trades_Sep21_Nov4_2026.csv, fed in order with its result: taken, same target (±0.25), same capped flag."""
        diffs = []
        for mode in ("eval", "funded"):
            sigs = expected_signals(mode)
            for s, (sid, take, step, target, capped) in zip(sigs, replay(sigs, card(mode))):
                if not take:
                    diffs.append(f"{sid}: skipped at step {step}")
                elif abs(target - s["_want_target"]) > 0.25 or capped != s["_want_capped"]:
                    diffs.append(f"{sid}: target {target} capped {capped}, expected {s['_want_target']} capped {s['_want_capped']}")
        self.assertEqual(diffs, [])


if __name__ == "__main__":
    unittest.main()
