"""
Mac bot: the MNQ Pass Plan's practice exits (stop, target, time exit) on the 1-minute bars.
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
