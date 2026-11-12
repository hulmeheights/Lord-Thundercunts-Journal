"""
Mac bot: the MNQ Pass Plan's market reading (signals, 4H bias, value area) and practice exits.
Run: python3 -m unittest tests/test_pass_runner.py -v
"""
import importlib.util
import os
import unittest
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("runner", os.path.join(HERE, "..", "public", "autopilot-runner.py"))
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)


def bar(t, o, h, l, c, v=100):
    return {"t": t.astimezone(timezone.utc).isoformat(), "o": o, "h": h, "l": l, "c": c, "v": v}


def flat_day(d, price=25000.0):
    """Every minute from 20:00 the evening before d to 16:30 on d, flat at price."""
    out = []
    t = R.ny_at(d - timedelta(days=1), 14, 0)
    end = R.ny_at(d, 20, 5)
    while t <= end:
        out.append(bar(t, price, price + 1, price - 1, price))
        t += timedelta(minutes=1)
    return out


def setbar(bars, t, **k):
    for b in bars:
        if R.iso(b["t"]) == t:
            b.update(k)
            return
    raise AssertionError(f"no bar at {t}")


THU = date(2026, 11, 12)


class PassMarket(unittest.TestCase):
    def test_value_area_70_percent_around_the_poc(self):
        bars = [bar(R.ny_at(THU, 3, 0), 100, 100.5, 100, 100, 600), bar(R.ny_at(THU, 4, 0), 101, 101.5, 101, 101, 200), bar(R.ny_at(THU, 5, 0), 99, 99.5, 99, 99, 100), bar(R.ny_at(THU, 6, 0), 110, 110.5, 110, 110, 100)]
        poc, val, vah = R.value_area(bars)
        self.assertEqual(poc, 100)
        # 1,000 total: POC 600, then 101 (200) → 800 ≥ 700.
        self.assertEqual((val, vah), (100, 102))

    def test_volume_spread_evenly_over_the_bar_range(self):
        poc, val, vah = R.value_area([bar(R.ny_at(THU, 3, 0), 100, 103.9, 100, 103, 400)])
        self.assertEqual(poc, 100)
        self.assertEqual(val, 100)
        self.assertEqual(vah, 103)  # 100, 101, 102 = 75%

    def test_four_hour_bias_is_the_body_only(self):
        bars = [bar(R.ny_at(THU, 2, 0), 100, 120, 90, 101), bar(R.ny_at(THU, 5, 59), 101, 130, 80, 99)]
        self.assertEqual(R.four_hour_bias(bars, R.ny_at(THU, 2, 0), R.ny_at(THU, 6, 0)), "DOWN")
        self.assertIsNone(R.four_hour_bias(bars, R.ny_at(THU, 10, 0), R.ny_at(THU, 14, 0)))

    def test_new_york_trades_with_the_first_30_minutes(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 9, 41), o=25000.0)
        setbar(bars, R.ny_at(THU, 10, 10), c=25040.0, h=25041.0)
        s = R.pass_measure(bars, "NY", THU)
        self.assertEqual((s["dir"], s["price"], s["tradingDay"]), ("LONG", 25040.0, "2026-11-12"))
        self.assertGreater(s["price"], s["vah"])  # well above a flat day's value area
        setbar(bars, R.ny_at(THU, 10, 10), c=24990.0, l=24989.0)
        self.assertEqual(R.pass_measure(bars, "NY", THU)["dir"], "SHORT")
        setbar(bars, R.ny_at(THU, 10, 10), c=25000.0)
        self.assertEqual(R.pass_measure(bars, "NY", THU)["dir"], "LONG")  # at the open counts as up

    def test_london_trades_against_the_first_30_minutes(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 3, 1), o=25000.0)
        setbar(bars, R.ny_at(THU, 3, 30), c=25010.0, h=25011.0)
        self.assertEqual(R.pass_measure(bars, "LON", THU)["dir"], "SHORT")
        setbar(bars, R.ny_at(THU, 3, 30), c=25000.0)
        self.assertEqual(R.pass_measure(bars, "LON", THU)["dir"], "LONG")

    def test_asia_is_long_belongs_to_the_next_day_and_skips_friday_and_saturday(self):
        bars = flat_day(THU)
        s = R.pass_measure(bars, "ASIA", THU)
        self.assertEqual((s["dir"], s["tradingDay"]), ("LONG", "2026-11-13"))
        self.assertIsNone(R.pass_measure(bars, "ASIA", date(2026, 11, 13)))  # Friday evening
        self.assertIsNone(R.pass_measure(bars, "NY", date(2026, 11, 14)))  # Saturday

    def test_waits_for_the_signal_bar(self):
        bars = [b for b in flat_day(THU) if R.iso(b["t"]) < R.ny_at(THU, 10, 10)]
        self.assertEqual(R.pass_measure(bars, "NY", THU), "wait")


class FakeTs:
    def __init__(self, bars):
        self._bars = bars

    def mnq(self):
        return "CON.F.US.MNQ.Z26"

    def bars(self, contract, start, end, limit=1000):
        s, e = R.iso(start), R.iso(end)
        return [b for b in self._bars if s <= R.iso(b["t"]) <= e]


class PassPractice(unittest.TestCase):
    def setUp(self):
        self.posted = []
        R.post = lambda base, auth, body: self.posted.append(body)

    def trade(self, **k):
        t = {"id": "pt_abcdef1234", "label": "Practice", "mode": "dry", "session": "NY", "dir": "LONG", "qty": 10, "entry": 25000.0, "stop": 24950.0, "target": 25082.0, "enteredAt": R.ny_at(THU, 10, 11).isoformat(), "exitAt": R.ny_at(THU, 16, 9).isoformat()}
        t.update(k)
        return t

    def test_target_then_pnl_after_commission(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 11, 0), h=25090.0)
        R.pass_watch("b", {}, FakeTs(bars), {"open": [self.trade()]}, R.ny_at(THU, 12, 0))
        self.assertEqual(self.posted[0]["reason"], "target")
        self.assertEqual(self.posted[0]["pnl"], 82 * 2 * 10 - 10)

    def test_a_bar_touching_both_is_a_loss(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 11, 0), h=25090.0, l=24940.0)
        R.pass_watch("b", {}, FakeTs(bars), {"open": [self.trade()]}, R.ny_at(THU, 12, 0))
        self.assertEqual((self.posted[0]["reason"], self.posted[0]["pnl"]), ("stop", -50 * 2 * 10 - 10))

    def test_time_exit_at_the_exit_bars_open(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 16, 9), o=25020.0)
        R.pass_watch("b", {}, FakeTs(bars), {"open": [self.trade()]}, R.ny_at(THU, 16, 10))
        self.assertEqual((self.posted[0]["reason"], self.posted[0]["exitPrice"]), ("time", 25020.0))
        self.posted.clear()
        R.pass_watch("b", {}, FakeTs(bars), {"open": [self.trade()]}, R.ny_at(THU, 15, 0))
        self.assertEqual(self.posted, [])  # still open, nothing hit


if __name__ == "__main__":
    unittest.main()
