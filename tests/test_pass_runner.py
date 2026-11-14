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


class LiveTs(FakeTs):
    """A pretend TopstepX account: one position, its bracket orders, and every call the bot makes."""

    def __init__(self, bars, orders, position=True, fills=None):
        super().__init__(bars)
        self.orders, self.position, self.calls, self.fills = orders, position, [], fills or []

    def bars(self, contract, start, end, limit=1000, partial=False):
        return super().bars(contract, start, end, limit)

    def accounts(self):
        return [{"id": 7, "name": "50KTC-V2-1"}]

    def positions(self, account_id):
        return [{"contractId": self.mnq(), "size": 10, "type": 1, "averagePrice": 25000.0}] if self.position else []

    def open_orders(self, account_id):
        return self.orders

    def trades(self, account_id, since):
        return self.fills

    def cancel(self, account_id, order_id):
        self.calls.append(("cancel", order_id))

    def call(self, path, body):
        self.calls.append((path.split("/")[-1], body))
        if path.endswith("closeContract"):
            self.position = False
        return {}


class GoalGuard(unittest.TestCase):
    """Each real account's own target: the order is kept at its price, and the account is closed at market if price trades through it."""

    def setUp(self):
        self.posted = []
        R.post = lambda base, auth, body: self.posted.append(body)
        R.time.sleep = lambda s: None
        R.GOAL_CLOSED.clear()
        R.GUARD_TOLD.clear()

    def trade(self, **k):
        t = {"id": "pt_live000001", "label": "Eval 1", "account": "50KTC-V2-1", "mode": "live", "strategy": "C", "guard": True, "session": "NY", "dir": "LONG", "qty": 10, "entry": 25000.0, "stop": 24950.0, "target": 25064.25, "enteredAt": R.ny_at(THU, 10, 11).isoformat(), "exitAt": R.ny_at(THU, 16, 9).isoformat()}
        t.update(k)
        return t

    def bracket(self, tp=25064.25):
        return [{"id": 1, "type": 4, "stopPrice": 24950.0, "size": 10}] + ([{"id": 2, "type": 1, "limitPrice": tp, "size": 10}] if tp else [])

    def test_all_in_place_does_nothing(self):
        ts = LiveTs(flat_day(THU), self.bracket())
        R.pass_watch("b", {}, ts, {"open": [self.trade()]}, R.ny_at(THU, 11, 0))
        self.assertEqual((ts.calls, self.posted), ([], []))

    def test_target_order_at_the_wrong_price_is_moved_back(self):
        ts = LiveTs(flat_day(THU), self.bracket(tp=25082.5))
        R.pass_watch("b", {}, ts, {"open": [self.trade()]}, R.ny_at(THU, 11, 0))
        self.assertEqual(ts.calls, [("modify", {"accountId": 7, "orderId": 2, "size": 10, "limitPrice": 25064.25})])
        self.assertEqual(self.posted[0]["type"], "pass_note")

    def test_price_through_the_target_with_the_position_open_closes_at_market(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 10, 59), h=25066.0)
        ts = LiveTs(bars, self.bracket())
        R.pass_watch("b", {}, ts, {"open": [self.trade()]}, R.ny_at(THU, 11, 0))
        self.assertEqual([c[0] for c in ts.calls], ["closeContract"])
        self.assertIn("pt_live000001", R.GOAL_CLOSED)
        # A touch of the price is the order's own job: nothing is closed.
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 10, 59), h=25064.25)
        ts = LiveTs(bars, self.bracket())
        R.pass_watch("b", {}, ts, {"open": [self.trade()]}, R.ny_at(THU, 11, 0))
        self.assertEqual(ts.calls, [])

    def test_no_target_order_closes_on_the_touch_and_says_so(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 10, 59), h=25064.25)
        ts = LiveTs(bars, self.bracket(tp=None))
        R.pass_watch("b", {}, ts, {"open": [self.trade()]}, R.ny_at(THU, 11, 0))
        self.assertEqual([c[0] for c in ts.calls], ["closeContract"])
        self.assertTrue(any(p["level"] == "error" and "no target order" in p["message"] for p in self.posted))

    def test_two_accounts_one_signal_each_closes_at_its_own_price(self):
        # The eval needs 64.25 points, the funded 72: price reaches 25,066 → only the eval is closed.
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 10, 59), h=25066.0)
        ev, fu = LiveTs(bars, self.bracket()), LiveTs(bars, self.bracket(tp=25072.0))
        R.pass_watch("b", {}, ev, {"open": [self.trade()]}, R.ny_at(THU, 11, 0))
        R.pass_watch("b", {}, fu, {"open": [self.trade(id="pt_live000002", target=25072.0, qty=7)]}, R.ny_at(THU, 11, 0))
        self.assertEqual(([c[0] for c in ev.calls], fu.calls), (["closeContract"], []))

    def test_guard_switched_off_leaves_it_alone(self):
        bars = flat_day(THU)
        setbar(bars, R.ny_at(THU, 10, 59), h=25090.0)
        ts = LiveTs(bars, self.bracket(tp=None))
        R.pass_watch("b", {}, ts, {"open": [self.trade(guard=False)]}, R.ny_at(THU, 11, 0))
        self.assertEqual(ts.calls, [])

    def test_a_guard_close_is_booked_as_goal(self):
        R.GOAL_CLOSED["pt_live000001"] = 1
        ts = LiveTs(flat_day(THU), [], position=False, fills=[{"price": 25066.0, "profitAndLoss": 1320.0, "fees": 7.4}])
        R.pass_watch("b", {}, ts, {"open": [self.trade()]}, R.ny_at(THU, 11, 0))
        closed = [p for p in self.posted if p["type"] == "pass_closed"][0]
        self.assertEqual((closed["reason"], closed["pnl"]), ("goal", 1312.6))

    def test_sor_fill_moves_the_bracket_onto_its_own_prices(self):
        ts = LiveTs(flat_day(THU), self.bracket(tp=25070.25), position=False)
        ts.place = lambda *a: setattr(ts, "position", True) or "o1"
        out = R.pass_place(ts, {"tradeId": "pt_sor0000001", "label": "Eval 1", "account": "50KTC-V2-1", "strategy": "SOR", "dir": "LONG", "qty": 5, "stopTicks": 140, "targetTicks": 280, "stopPrice": 24965.0, "targetPrice": 25070.0}, [])
        self.assertEqual((out["status"], out["fill"], out["stop"], out["target"]), ("open", 25000.0, 24965.0, 25070.0))
        self.assertEqual([c[1].get("stopPrice") or c[1].get("limitPrice") for c in ts.calls], [24965.0, 25070.0])


class HedgeTs(LiveTs):
    """Three accounts under one login: ours is flat, the others hold whatever the test says."""

    def __init__(self, held):
        super().__init__([], [], position=False)
        self.held, self.placed = held, []

    def accounts(self):
        return [{"id": 7, "name": "50KTC-V2-1"}, {"id": 8, "name": "EXPRESS-2"}, {"id": 9, "name": "MANUAL-3"}]

    def positions(self, account_id):
        if account_id == 7:
            return [{"size": 10, "type": 1, "averagePrice": 25000.0}] if self.placed else []
        v = self.held.get(account_id, [])
        if isinstance(v, Exception):
            raise v
        return v

    def place(self, *a):
        self.placed.append(a)
        return "o1"


class HedgeBlocker(unittest.TestCase):
    """No order goes in while any other Topstep account under the login holds the other side."""

    ORDER = {"tradeId": "pt_hedge00001", "label": "Eval 1", "account": "50KTC-V2-1", "strategy": "C", "dir": "SHORT", "qty": 10, "stopTicks": 200, "targetTicks": 330}

    def setUp(self):
        R.time.sleep = lambda s: None

    def test_another_account_long_blocks_a_short_even_if_it_has_no_card(self):
        ts = HedgeTs({9: [{"size": 3, "type": 1}]})  # MANUAL-3 is long, placed by hand, no card
        out = R.pass_place(ts, dict(self.ORDER), [])
        self.assertEqual((out["status"], ts.placed), ("error", []))
        self.assertIn("MANUAL-3 holds the other side", out["reason"])

    def test_same_side_elsewhere_is_fine(self):
        ts = HedgeTs({8: [{"size": 7, "type": 2}]})  # EXPRESS-2 is short too
        self.assertEqual(R.pass_place(ts, dict(self.ORDER), [])["status"], "open")
        self.assertEqual(len(ts.placed), 1)

    def test_an_account_that_cant_be_checked_blocks_too(self):
        ts = HedgeTs({8: RuntimeError("searchOpen failed (500)")})
        out = R.pass_place(ts, dict(self.ORDER), [])
        self.assertEqual((out["status"], ts.placed), ("error", []))
        self.assertIn("couldn't check EXPRESS-2", out["reason"])


if __name__ == "__main__":
    unittest.main()
