/** The TradingView script "MNQ Pass Plan [1m]" (Pine v5 strategy), shown on the Pass plan page to copy. Keep in step with public/pass-plan-signals.pine. */
export const PASS_PINE = String.raw`//@version=5
// =============================================================================
//  MNQ PASS PLAN [1m]   (scripts C and D, rules pack 11 Nov 2026)
//  A strategy: the Strategy Tester trades one simulated account through the
//  rules pack (EVAL -> FUNDED / PRE-LIVE -> payout, a new eval after a payout
//  or a blow-up), with the stop, target and filters of its stage, so you can
//  see the results. Pick Script C or D, Topstep or Lucid in the settings.
//
//  The alert is separate from the simulated account: every session's signal
//  goes out with its 4H bias and value area, and the journal decides for each
//  of YOUR accounts (its own stage and script); your Mac places the orders.
//
//  Chart: CME_MINI:MNQ1!, 1 minute.
//  Alert: Condition = this script -> "alert() function calls only"
//         (NOT "Order fills": those aren't for the bot),
//         Webhook URL = https://lord-thundercunts-journal.vercel.app/api/bot/webhook
//         (leave the Message box as it is: the script writes its own message).
//
//  ASIA    close of the 20:00 New York bar -> LONG (not Friday/Saturday evening)
//  LONDON  close of the 03:30 bar vs the 03:01 open: above -> SHORT, else LONG
//  NY      close of the 10:10 bar vs the 09:41 open: at/above -> LONG, else SHORT
//  4H bias: body of the last finished 4H candle (18/22/02/06/10/14 New York):
//           Asia 14:00-18:00, London 22:00-02:00, New York 02:00-06:00
//  Value area: 1-point volume profile from 20:00 New York (Asia: the previous
//           24 hours), 70% around the POC.
// =============================================================================
strategy("MNQ Pass Plan [1m]", overlay=true, max_labels_count=300, initial_capital=50000, default_qty_type=strategy.fixed, default_qty_value=10, commission_type=strategy.commission.cash_per_contract, commission_value=0.5, slippage=1, pyramiding=0)

secret = input.string("", "Webhook Secret (same as BOT_WEBHOOK_SECRET in Vercel)")
grpT = "Strategy Tester (the simulated account)"
inScript = input.string("D", "Script", options=["A", "C", "D"], group=grpT, tooltip="A: no filters ever. C: both filters always. D: no filter in EVAL, both filters once funded.")
inFirm = input.string("Topstep", "Firm", options=["Topstep", "Lucid"], group=grpT)
inDll = input.bool(true, "Topstep: bought with the daily loss limit ($4,000 payout)", group=grpT)
inQty = input.int(10, "Contracts (MNQ)", minval=1, maxval=50, group=grpT)
inAfter = input.string("New eval", "After a pass", options=["New eval", "Go funded"], group=grpT, tooltip="New eval: a pass ends that eval and a fresh one starts the next trading day (counts passes per eval bought). Go funded: the same account carries on as FUNDED (Topstep) / PRE-LIVE (Lucid) to the payout.")

TZ = "America/New_York"
hr = hour(time, TZ)
mn = minute(time, TZ)
dow = dayofweek(time, TZ)
at(h, m) => hr == h and mn == m
dayAt(h) => timestamp(TZ, year(time, TZ), month(time, TZ), dayofmonth(time, TZ), h, 0)

// ---------------- 4H candles (18, 22, 02, 06, 10, 14 New York) ----------------
blockStart = time - (((hr + 2) % 4) * 60 + mn) * 60000
newBlock = blockStart != blockStart[1]
var float curO = na
var float curC = na
var int curS = na
var float c14o = na
var float c14c = na
var int c14s = na
var float c22o = na
var float c22c = na
var int c22s = na
var float c02o = na
var float c02c = na
var int c02s = na
if newBlock
    if not na(curS)
        sh = hour(curS, TZ)
        if sh == 14
            c14o := curO
            c14c := curC
            c14s := curS
        if sh == 22
            c22o := curO
            c22c := curC
            c22s := curS
        if sh == 2
            c02o := curO
            c02c := curC
            c02s := curS
    curS := blockStart
    curO := open
curC := close

biasOf(o, c, s, expected) =>
    na(s) or s != expected ? "null" : c > o ? "\"UP\"" : c < o ? "\"DOWN\"" : "null"

// ---------------- volume profile, 1-point bins, from 20:00 New York ----------------
var vol = map.new<int, float>()
var int lob = na
var int hib = na

vaOf() =>
    float tot = 0.0
    float best = -1.0
    int poc = na
    if not na(lob)
        for k = lob to hib
            v = nz(vol.get(k))
            tot += v
            if v > best
                best := v
                poc := k
    float val = na
    float vah = na
    if tot > 0
        int lo = poc
        int hi = poc
        float inside = best
        while inside < 0.7 * tot
            up = hi + 1 <= hib ? nz(vol.get(hi + 1)) : -1.0
            dn = lo - 1 >= lob ? nz(vol.get(lo - 1)) : -1.0
            if up < 0 and dn < 0
                break
            if up >= dn
                hi += 1
                inside += math.max(up, 0)
            else
                lo -= 1
                inside += dn
        val := lo
        vah := hi + 1
    [val, vah]

addBar() =>
    lo = int(math.floor(low))
    hi = int(math.floor(high))
    v = nz(volume)
    if v > 0 and hi >= lo
        n = hi - lo + 1
        for k = lo to hi
            vol.put(k, nz(vol.get(k)) + v / n)
    true

addBar()
lo0 = int(math.floor(low))
hi0 = int(math.floor(high))
lob := na(lob) ? lo0 : math.min(lob, lo0)
hib := na(hib) ? hi0 : math.max(hib, hi0)

// ---------------- the signals ----------------
var float lonRef = na
var float nyRef = na
if at(3, 1)
    lonRef := open
if at(9, 41)
    nyRef := open

string sess = ""
string dir = ""
string bias = "null"
float vaL = na
float vaH = na
if at(20, 0)
    // Asia: the previous 24 hours' profile (this 20:00 bar included), then a fresh one from 20:00.
    [l, h] = vaOf()
    if dow != dayofweek.friday and dow != dayofweek.saturday
        sess := "ASIA"
        dir := "LONG"
        bias := biasOf(c14o, c14c, c14s, dayAt(14))
        vaL := l
        vaH := h
    vol.clear()
    lob := lo0
    hib := hi0
    addBar()
    lonRef := na
    nyRef := na
if at(3, 30) and not na(lonRef) and dow != dayofweek.saturday and dow != dayofweek.sunday
    [l, h] = vaOf()
    sess := "LON"
    dir := close > lonRef ? "SHORT" : "LONG"
    bias := biasOf(c22o, c22c, c22s, dayAt(2) - 4 * 3600000)
    vaL := l
    vaH := h
if at(10, 10) and not na(nyRef) and dow != dayofweek.saturday and dow != dayofweek.sunday
    [l, h] = vaOf()
    sess := "NY"
    dir := close >= nyRef ? "LONG" : "SHORT"
    bias := biasOf(c02o, c02c, c02s, dayAt(2))
    vaL := l
    vaH := h

num(x) => na(x) ? "null" : str.tostring(x)
outside = not na(vaH) and (close > vaH or close < vaL)
agrees = (dir == "LONG" and bias == "\"UP\"") or (dir == "SHORT" and bias == "\"DOWN\"")

// ---------------- the alert: every signal, for the journal to decide per account ----------------
if sess != ""
    tday = str.format_time(time + 6 * 3600000, "yyyy-MM-dd", TZ)
    msg = "{\"secret\":\"" + secret + "\",\"event\":\"pass\",\"session\":\"" + sess + "\",\"trading_day\":\"" + tday + "\",\"dir\":\"" + dir + "\",\"price\":" + str.tostring(close) + ",\"bias\":" + bias + ",\"vah\":" + num(vaH) + ",\"val\":" + num(vaL) + ",\"id\":\"" + str.tostring(time) + "-" + sess + "\"}"
    alert(msg, alert.freq_once_per_bar_close)

// ---------------- the simulated account (section 5 and 6 of the rules pack) ----------------
isLucid = inFirm == "Lucid"
var string stage = "EVAL"
var float prof = 0.0
var float today = 0.0
var float best = 0.0
var int winDays = 0
var float maxEod = 0.0
var int evals = 1
var int passes = 0
var int payouts = 0
var int blown = 0
var float lastNet = 0.0
var string restDay = ""

net = strategy.netprofit
if net != lastNet
    prof += net - lastNet
    today += net - lastNet
    lastNet := net

// A new trading day starts at 18:00 New York.
tdayKey = str.format_time(time + 6 * 3600000, "yyyyMMdd", TZ)
if bar_index > 0 and tdayKey != tdayKey[1]
    best := math.max(best, today)
    if today >= 150
        winDays += 1
    maxEod := math.max(maxEod, prof)
    today := 0.0

floorP = math.min(maxEod - 2000, 0)
bestNow = math.max(best, today)
winNow = winDays + (today >= 150 ? 1 : 0)
payoutAt = inDll ? 8000.0 : 4000.0
cons = isLucid ? 0.40 : 0.55

// Passed, payout, blown: checked whenever flat.
if strategy.position_size == 0
    bool reset = false
    if prof <= floorP
        blown += 1
        evals += 1
        stage := "EVAL"
        reset := true
    else if stage == "EVAL" and prof >= 3000 and bestNow <= cons * prof
        passes += 1
        if inAfter == "New eval"
            evals += 1
        else
            stage := isLucid ? "PRELIVE" : "FUNDED"
        reset := true
    else if stage == "FUNDED" and winNow >= 5 and prof >= payoutAt
        payouts += 1
        evals += 1
        stage := "EVAL"
        reset := true
    else if stage == "PRELIVE" and prof >= 2000
        payouts += 1
        evals += 1
        stage := "EVAL"
        reset := true
    if reset
        restDay := tdayKey  // done for today: the next account starts on the next trading day
        prof := 0.0
        today := 0.0
        best := 0.0
        winDays := 0
        maxEod := 0.0

risk = stage == "EVAL" ? 1000.0 : stage == "FUNDED" ? 750.0 : 1250.0
cap = isLucid ? (stage == "EVAL" ? 1200.0 : 2000.0) : (stage == "EVAL" ? 1640.0 : (inDll ? 2500.0 : 1640.0))
dllAmt = (not isLucid and inDll) ? 1000.0 : 1e9
before = prof - today
goal = stage == "FUNDED" ? (winDays >= 5 ? math.min(cap, payoutAt - before) : cap) : stage == "PRELIVE" ? math.min(cap, 2000 - before) : math.min(cap, math.max(3000 - before, best / cons - before))
left = goal - today
// The last bit to a pass / payout (not just the day cap)? Then even a few dollars is worth one more trade.
finishing = stage == "FUNDED" ? (winDays >= 5 and payoutAt - before <= cap) : stage == "PRELIVE" ? (2000 - before <= cap) : (math.max(3000 - before, best / cons - before) <= cap)
room = math.min(prof - floorP, dllAmt + today)
useFilters = inScript == "C" or (inScript == "D" and stage != "EVAL")
take = sess != "" and tdayKey != restDay and strategy.position_size == 0 and left > 0 and (left >= 25 or finishing) and room >= 25 and (not useFilters or (agrees and outside))
riskNow = math.min(risk, room)
stopT = math.floor(riskNow / (inQty * 2) / 0.25)
// The target covers the $1/contract costs, so hitting it really adds what's left (at least $25 when it finishes the account).
aim = (finishing ? math.max(left, 25) : left) + inQty * 1.0
tgtT = math.max(1, math.ceil(aim / (inQty * 2) / 0.25 - 1e-9))
if take and stopT >= 1
    strategy.entry("Pass", dir == "LONG" ? strategy.long : strategy.short, qty=inQty, comment=sess + " " + stage)
    strategy.exit("Pass out", "Pass", loss=stopT, profit=tgtT, comment_loss="stop", comment_profit="target")

// Time exits (filled at the open of 02:59, 09:39, 16:09 New York).
if at(2, 58) or at(9, 38) or at(16, 8)
    strategy.close("Pass", comment="time exit")

// ---------------- chart labels and the account table ----------------
if sess != ""
    txt = sess + " " + dir + "\n4H " + (bias == "null" ? "flat" : str.replace_all(bias, "\"", "")) + (agrees ? " ✓" : " ✗") + "\nVA " + num(vaL) + "-" + num(vaH) + (outside ? " out ✓" : " in ✗")
    label.new(bar_index, dir == "LONG" ? low : high, txt, style=dir == "LONG" ? label.style_label_up : label.style_label_down, color=color.new(dir == "LONG" ? color.teal : color.maroon, 15), textcolor=color.white, size=size.small)

var table t = table.new(position.top_right, 2, 9, bgcolor=color.new(color.black, 20), border_width=1)
if barstate.islast
    fee = isLucid ? 180 : 120
    table.cell(t, 0, 0, "Stage", text_color=color.white)
    table.cell(t, 1, 0, stage, text_color=color.yellow)
    table.cell(t, 0, 1, "Profit (this stage)", text_color=color.white)
    table.cell(t, 1, 1, "$" + str.tostring(prof, "#,###"), text_color=prof >= 0 ? color.lime : color.red)
    table.cell(t, 0, 2, "Today / goal", text_color=color.white)
    table.cell(t, 1, 2, "$" + str.tostring(today, "#,###") + " / $" + str.tostring(math.max(goal, 0), "#,###"), text_color=color.white)
    table.cell(t, 0, 3, "Best day / winning days", text_color=color.white)
    table.cell(t, 1, 3, "$" + str.tostring(bestNow, "#,###") + " / " + str.tostring(winNow), text_color=color.white)
    table.cell(t, 0, 4, "Evals bought", text_color=color.white)
    table.cell(t, 1, 4, str.tostring(evals) + "  ($" + str.tostring(evals * fee, "#,###") + ")", text_color=color.white)
    table.cell(t, 0, 5, "Passed", text_color=color.white)
    table.cell(t, 1, 5, str.tostring(passes), text_color=color.lime)
    table.cell(t, 0, 6, isLucid ? "Pre-live done" : "Payouts", text_color=color.white)
    table.cell(t, 1, 6, str.tostring(payouts), text_color=color.lime)
    table.cell(t, 0, 7, "Blown", text_color=color.white)
    table.cell(t, 1, 7, str.tostring(blown), text_color=color.red)
    table.cell(t, 0, 8, "Script / firm", text_color=color.white)
    table.cell(t, 1, 8, inScript + " / " + inFirm + (isLucid ? "" : inDll ? " (DLL)" : ""), text_color=color.white)
`;
