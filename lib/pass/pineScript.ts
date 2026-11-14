/** The TradingView script "MNQ LIVE - C + SOR SAFE (one script) [1m]" (Pine v5), shown on the Pass plan page to copy. Keep in step with public/pass-plan-signals.pine. */
export const PASS_PINE_NAME = "MNQ LIVE - C + SOR SAFE (one script) [1m]";
export const PASS_PINE = String.raw`//@version=5
// =============================================================================
//  MNQ LIVE - ONE SCRIPT: C + SOR SAFE (14 Nov 2026)
//  ONE alert on this script sends BOTH: every C trade ("event":"pass","script":"C")
//  and every SOR SAFE trade ("event":"signal","swing":"3/3","safe_ok":true).
//  If you use this, DELETE the alerts on the separate C script and SOR script.
//  It does not send SOR health alerts.
//  Alerts are ON by default ("Send alerts" in the settings). C logic is identical to C v3.
//  SOR SAFE: London (first 150 min) + NY AM (first 90 min) only. No NY PM, no Asia.
//  Simulated account: funded trades 7 MNQ with a $1,000 day goal and keeps trading after a payout.
//  4H candle bias + outside the value area, in every stage. Sizes down when an
//  account is short of room (same stop distance, fewer contracts).
//
//  ALERTS: every C trade goes out, every time, whatever the chart is doing.
//  Nothing in the script ever stops the alerts. Your website decides, per
//  account (eval or funded), whether to take it and with what target and size.
//
//  CHART (Strategy Tester) has two modes, it does NOT affect the alerts:
//   "Every C trade"     - takes every C signal at full size: 50-point stop,
//                         82-point target ($1,640), time exit. Never stops.
//   "Simulated account" - one pretend account through EVAL -> FUNDED / PRE-LIVE
//                         -> payout -> new eval, with day goals, so you can see
//                         pass rates and fees.
//
//
//  Chart: CME_MINI:MNQ1!, 1 minute. All times New York.
//  Alert: Condition = this script -> "alert() function calls only",
//         Webhook URL = your journal's /api/bot/webhook,
//         leave the Message box as it is (the script writes its own message).
//
//  ASIA    close of the 20:00 bar -> LONG (not Friday or Saturday evening)
//  LONDON  close of the 03:30 bar vs the 03:01 open: above -> SHORT, else LONG
//  NY      close of the 10:10 bar vs the 09:41 open: at/above -> LONG, else SHORT
//  Filter 1: body of the last finished 4H candle (18/22/02/06/10/14) must point
//            the same way: Asia uses 14:00-18:00, London 22:00-02:00, NY 02:00-06:00
//  Sunday evening Asia uses Friday's 14:00-18:00 candle (fixed 13 Nov 2026).
//  Panel (bottom right): the next session, its 4H bias, what direction it needs,
//  the value-area lines (orange) and reference open (blue), and whether it
//  would take the trade if the signal bar closed right now.
//  Filter 2: price must be outside the 70% value area of the 1-point volume
//            profile from 20:00 (Asia: the previous 24 hours)
//  Time exits: 02:59, 09:39, 16:09
// =============================================================================
strategy("MNQ LIVE - C + SOR SAFE (one script) [1m]", overlay=true, max_bars_back=1500, max_labels_count=300, max_boxes_count=300, max_lines_count=300, initial_capital=50000, default_qty_type=strategy.fixed, default_qty_value=10, commission_type=strategy.commission.cash_per_contract, commission_value=0.5, slippage=1, pyramiding=0)

secret = input.string("", "Webhook Secret (same as BOT_WEBHOOK_SECRET in Vercel)")
grpT = "Strategy Tester (the simulated account)"
inFirm = input.string("Topstep", "Firm", options=["Topstep", "Lucid"], group=grpT)
inDll = input.bool(false, "Topstep: bought with the daily loss limit ($4,000 payout)", group=grpT)
inQty = input.int(10, "Contracts (MNQ)", minval=1, maxval=50, group=grpT)
inEvalR = input.float(1000, "Eval risk per trade ($)", step=50, group=grpT)
inFundR = input.float(1000, "Topstep funded risk per trade ($)", step=50, group=grpT)
inFundQty = input.int(7, "Topstep funded contracts (MNQ)", minval=1, maxval=50, group=grpT)
inFundCap = input.float(1000, "Topstep funded day goal ($)", step=50, group=grpT)
inPreR = input.float(1250, "Lucid Pre-Live risk per trade ($)", step=50, group=grpT)
inLabels = input.bool(true, "Show a label on every session signal", group=grpT)
inDraw = input.bool(true, "Draw stop / target boxes on each trade", group=grpT)
inPanel = input.bool(true, "Show the next-trade panel and its levels", group=grpT)
inSor = input.bool(true, "Add SOR SAFE trades (Topstep eval only in Simulated account)", group=grpT)
inSorQty = input.int(5, "SOR contracts", minval=1, maxval=20, group=grpT)
inAlerts = input.bool(true, "Send alerts (C trades and SOR SAFE trades)", group=grpT)
inMode = input.string("Every C trade", "Chart mode", options=["Every C trade", "Simulated account"], group=grpT, tooltip="Only changes what the Strategy Tester shows. Alerts always go out for every C trade.")

TZ = "America/New_York"
hr = hour(time, TZ)
mn = minute(time, TZ)
dow = dayofweek(time, TZ)
at(h, m) => hr == h and mn == m
dayAt(h) => timestamp(TZ, year(time, TZ), month(time, TZ), dayofmonth(time, TZ), h, 0)
dayAtBack(h, n) =>
    t0 = time - n * 86400000
    timestamp(TZ, year(t0, TZ), month(t0, TZ), dayofmonth(t0, TZ), h, 0)

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
        // Sunday evening: the last finished 14:00 candle is Friday's (the market is shut until 18:00 Sunday).
        bias := biasOf(c14o, c14c, c14s, dow == dayofweek.sunday ? dayAtBack(14, 2) : dayAt(14))
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
cOk = sess != "" and agrees and outside

// ---------------- the alert: every C trade, always ----------------
// Fires on every signal that passes both filters. It does not look at the
// simulated account, open positions or anything else, so it never stops.
stopPtsE = math.floor(inEvalR / (inQty * 2) / 0.25) * 0.25
stopPtsF = math.floor(inFundR / (inQty * 2) / 0.25) * 0.25
stopPtsP = math.floor(inPreR / (inQty * 2) / 0.25) * 0.25
if cOk and inAlerts
    tday = str.format_time(time + 6 * 3600000, "yyyy-MM-dd", TZ)
    exitBy = sess == "ASIA" ? "02:59" : sess == "LON" ? "09:39" : "16:09"
    msg = "{\"secret\":\"" + secret + "\",\"event\":\"pass\",\"script\":\"C\",\"session\":\"" + sess + "\",\"trading_day\":\"" + tday + "\",\"dir\":\"" + dir + "\",\"price\":" + str.tostring(close) + ",\"bias\":" + bias + ",\"vah\":" + num(vaH) + ",\"val\":" + num(vaL) + ",\"c_ok\":true" + ",\"qty\":" + str.tostring(inQty) + ",\"stop_pts_eval\":" + str.tostring(stopPtsE) + ",\"stop_pts_funded\":" + str.tostring(stopPtsF) + ",\"stop_pts_prelive\":" + str.tostring(stopPtsP) + ",\"day_cap_topstep\":1640,\"day_cap_lucid_eval\":1200,\"exit_by\":\"" + exitBy + "\",\"id\":\"" + str.tostring(time) + "-" + sess + "\"}"
    alert(msg, alert.freq_once_per_bar_close)

// ---------------- the simulated account ----------------
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
var int stuck = 0
var float lastNet = 0.0
var int nTrades = 0
var int nSignalsOk = 0
var int firstTime = na
if na(firstTime)
    firstTime := time

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

payoutAt = inDll ? 8000.0 : 4000.0
cons = isLucid ? 0.40 : 0.55
riskOf(st) => st == "EVAL" ? inEvalR : st == "FUNDED" ? inFundR : inPreR
stopTOf(st) => math.floor(riskOf(st) / (inQty * 2) / 0.25)

// Passed, payout, blown: checked whenever flat.
if strategy.position_size == 0
    floorP0 = math.min(maxEod - 2000, 0)
    bestNow0 = math.max(best, today)
    winNow0 = winDays + (today >= 150 ? 1 : 0)
    oneLot = stopTOf(stage) * 0.25 * 2
    bool reset = false
    if prof <= floorP0
        blown += 1
        evals += 1
        stage := "EVAL"
        reset := true
    else if prof - floorP0 < oneLot
        // Not enough room left for even one contract at the full stop: the account is finished.
        blown += 1
        stuck += 1
        evals += 1
        stage := "EVAL"
        reset := true
    else if stage == "EVAL" and prof >= 3000 and bestNow0 <= cons * prof
        passes += 1
        stage := isLucid ? "PRELIVE" : "FUNDED"
        reset := true
    else if stage == "FUNDED" and winNow0 >= 5 and prof >= payoutAt
        // Payout: take half the balance, keep trading the same account. The loss floor is $0 from now on.
        payouts += 1
        prof -= payoutAt / 2
        today := 0.0
        winDays := 0
        maxEod := 2000.0
    else if stage == "PRELIVE" and prof >= 2000
        payouts += 1
        evals += 1
        stage := "EVAL"
        reset := true
    if reset
        prof := 0.0
        today := 0.0
        best := 0.0
        winDays := 0
        maxEod := 0.0

floorP = math.min(maxEod - 2000, 0)
bestNow = math.max(best, today)
winNow = winDays + (today >= 150 ? 1 : 0)
risk = riskOf(stage)
cap = isLucid ? (stage == "EVAL" ? 1200.0 : 2000.0) : (stage == "FUNDED" ? inFundCap : 1640.0)
dllAmt = (not isLucid and inDll) ? 1000.0 : 1e9
before = prof - today
goal = stage == "FUNDED" ? (winDays >= 5 ? math.min(cap, payoutAt - before) : cap) : stage == "PRELIVE" ? math.min(cap, 2000 - before) : math.min(cap, math.max(3000 - before, best / cons - before))
left = goal - today
// The last bit to a pass / payout (not just the day cap)? Then even a few dollars is worth one more trade.
finishing = stage == "FUNDED" ? (winDays >= 5 and payoutAt - before <= cap) : stage == "PRELIVE" ? (2000 - before <= cap) : (math.max(3000 - before, best / cons - before) <= cap)
room = math.min(prof - floorP, dllAmt + today)
if cOk
    nSignalsOk += 1
take = cOk and strategy.position_size == 0 and left > 0 and (left >= 25 or finishing) and room >= 25
// Always the full-size stop; when a loss limit has less room, fewer contracts (never a tighter stop).
stopT = stopTOf(stage)
qMax = stage == "FUNDED" and not isLucid ? inFundQty : inQty
qtyNow = math.min(qMax, int(math.floor(room / (stopT * 0.25 * 2))))
// The target covers the $1/contract costs, so hitting it really adds what's left (at least $25 when it finishes the account).
qT = math.max(qtyNow, 1)
aim = (finishing ? math.max(left, 25) : left) + qT * 1.0
tgtT = math.max(1, math.ceil(aim / (qT * 2) / 0.25 - 1e-9))
// ---------------- orders ----------------
plainMode = inMode == "Every C trade"
int ordStop = na
int ordTgt = na
int ordQty = na
if plainMode and cOk and strategy.position_size == 0
    ordStop := int(math.floor(inEvalR / (inQty * 2) / 0.25))
    ordTgt := int(math.ceil((1640.0 + inQty * 1.0) / (inQty * 2) / 0.25 - 1e-9))
    ordQty := inQty
if not plainMode and take and stopT >= 1 and qtyNow >= 1
    ordStop := int(stopT)
    ordTgt := int(tgtT)
    ordQty := qtyNow
if not na(ordQty)
    nTrades += 1
    strategy.entry("Pass", dir == "LONG" ? strategy.long : strategy.short, qty=ordQty, comment=sess + (plainMode ? "" : " " + stage) + (ordQty < inQty ? " x" + str.tostring(ordQty) : ""))
    strategy.exit("Pass out", "Pass", loss=ordStop, profit=ordTgt, comment_loss="stop", comment_profit="target")

// Time exits (filled at the open of 02:59, 09:39, 16:09 New York).
if at(2, 58) or at(9, 38) or at(16, 8)
    strategy.close("Pass", comment="time exit")

// ---------------- win / loss streaks from the closed trades ----------------
var int nW = 0
var int nL = 0
var int cur = 0
var int maxW = 0
var int maxL = 0
var int wRuns = 0
var int lRuns = 0
var float gW = 0.0
var float gL = 0.0
var int sorN = 0
var int sorW = 0
var float sorNet = 0.0
var int cN = 0
var int cW = 0
var float cNet = 0.0
ctNow = strategy.closedtrades
ctPrev = nz(ctNow[1])
if ctNow > ctPrev
    for i = ctPrev to ctNow - 1
        p = strategy.closedtrades.profit(i)
        isS = strategy.closedtrades.entry_id(i) == "SOR"
        if isS
            sorN += 1
            sorNet += p
            if p > 0
                sorW += 1
        else
            cN += 1
            cNet += p
            if p > 0
                cW += 1
        if p > 0
            nW += 1
            gW += p
            if cur <= 0
                wRuns += 1
            cur := cur > 0 ? cur + 1 : 1
        else
            nL += 1
            gL -= p
            if cur >= 0
                lRuns += 1
            cur := cur < 0 ? cur - 1 : -1
        maxW := math.max(maxW, cur)
        maxL := math.max(maxL, -cur)

// ---------------- stop / target boxes on every trade ----------------
// Green box = entry to target, red box = entry to stop, dotted white = entry.
// Drawn out to the time exit; cut short where the trade actually closed.
var box bxT = na
var box bxS = na
var line lnE = na
var float trE = na
var float trS = na
var float trG = na
var string trDir = ""
var string trSess = ""
var string trExit = ""
if ctNow > ctPrev and not na(bxT)
    box.set_right(bxT, time)
    box.set_right(bxS, time)
    line.set_x2(lnE, time)
    box.set_bgcolor(bxT, color.new(color.lime, 93))
    box.set_bgcolor(bxS, color.new(color.red, 93))
if not na(ordQty)
    sg = dir == "LONG" ? 1.0 : -1.0
    trE := close
    trS := close - sg * ordStop * syminfo.mintick
    trG := close + sg * ordTgt * syminfo.mintick
    trDir := dir
    trSess := sess
    trExit := sess == "ASIA" ? "02:59" : sess == "LON" ? "09:39" : "16:09"
    if inDraw
        endT = time + (sess == "ASIA" ? 419 : sess == "LON" ? 369 : 359) * 60000
        usdS = ordStop * syminfo.mintick * syminfo.pointvalue * ordQty
        usdG = ordTgt * syminfo.mintick * syminfo.pointvalue * ordQty
        bxT := box.new(time, math.max(trE, trG), endT, math.min(trE, trG), xloc=xloc.bar_time, border_color=color.new(color.lime, 40), border_style=line.style_dashed, bgcolor=color.new(color.lime, 85), text="TARGET " + str.tostring(trG, "#,###.##") + "  +$" + str.tostring(usdG, "#,###"), text_color=color.lime, text_size=size.small, text_halign=text.align_right, text_valign=sg > 0 ? text.align_top : text.align_bottom)
        bxS := box.new(time, math.max(trE, trS), endT, math.min(trE, trS), xloc=xloc.bar_time, border_color=color.new(color.red, 40), border_style=line.style_dashed, bgcolor=color.new(color.red, 85), text="STOP " + str.tostring(trS, "#,###.##") + "  -$" + str.tostring(usdS, "#,###"), text_color=color.red, text_size=size.small, text_halign=text.align_right, text_valign=sg > 0 ? text.align_bottom : text.align_top)
        lnE := line.new(time, trE, endT, trE, xloc=xloc.bar_time, color=color.white, style=line.style_dotted, width=1)

// =============================================================================
// ---------------- SOR SAFE add-on (TEST: Topstep EVAL only) ----------------
// Rebuilt from "MNQ Session Open Reversal v4" eval set (swing 3/3).
// Sessions tracked (NY): London 03:00-06:00, NY AM 09:30-12:00, NY PM 13:30-15:55
// (NY PM is only tracked for levels; SOR does NOT trade NY PM).
// Only the FIRST valid eval signal of each session counts (not Thursday,
// London first 150 min, NY AM first 90 min, stop 4-76 pts, has a target).
// These SOR windows apply to SOR only. C's times (20:00, 03:30, 10:10) never change.
// If that first signal is safe_ok (against EMA 2000, day ATR >= 6.75) it
// is traded at 5 MNQ with SOR's own stop and target PRICES, otherwise no
// SOR trade that session. One position at a time; C always comes first.
// All SOR trades close at 16:09 New York.
// =============================================================================
smn = hr * 60 + mn
sorId = smn >= 570 and smn < 720 ? 1 : smn >= 810 and smn < 955 ? 2 : smn >= 180 and smn < 360 ? 3 : 0
sorName = sorId == 1 ? "NYAM" : sorId == 2 ? "NYPM" : sorId == 3 ? "LON" : "-"
sorNew = sorId != 0 and sorId != nz(sorId[1])
sorEnd = nz(sorId[1]) != 0 and sorId != nz(sorId[1])
tdowS = dayofweek(time + 6 * 3600000, TZ)
var float soOpen = na
var int soOpenBar = na
var int soOpenTime = na
var float soHi = na
var float soLo = na
var int soHiBar = na
var int soLoBar = na
if sorNew
    soOpen := open
    soOpenBar := bar_index
    soOpenTime := time
    soHi := high
    soLo := low
    soHiBar := bar_index
    soLoBar := bar_index
else if sorId != 0
    if high > soHi
        soHi := high
        soHiBar := bar_index
    if low < soLo
        soLo := low
        soLoBar := bar_index
soRunDn = soOpen - soLo
soRunUp = soHi - soOpen
soMins = sorId != 0 ? (time - soOpenTime) / 60000 : na
soQuiet = ta.sma(ta.tr(true), 60) < 8
soDayAtr = ta.sma(ta.tr(true), 1380)[1]
soEma = ta.ema(close, 2000)[1]

// swing points 3/3
soPh = ta.pivothigh(high, 3, 3)
soPl = ta.pivotlow(low, 3, 3)
var phP = array.new_float()
var phB = array.new_int()
var plP = array.new_float()
var plB = array.new_int()
if not na(soPh)
    array.push(phP, soPh)
    array.push(phB, bar_index - 3)
    if array.size(phP) > 300
        array.shift(phP)
        array.shift(phB)
if not na(soPl)
    array.push(plP, soPl)
    array.push(plB, bar_index - 3)
    if array.size(plP) > 300
        array.shift(plP)
        array.shift(plB)

// untapped levels (targets)
var mgP = array.new_float()
var mgS = array.new_int()
var mgB = array.new_int()
if array.size(mgP) > 0
    for i = array.size(mgP) - 1 to 0
        p = array.get(mgP, i)
        sd = array.get(mgS, i)
        b = array.get(mgB, i)
        tapped = bar_index > b and ((sd == 1 and high >= p) or (sd == -1 and low <= p))
        if tapped or bar_index - b > 5 * 1380
            array.remove(mgP, i)
            array.remove(mgS, i)
            array.remove(mgB, i)
soLastBefore(prices, bars, maxBar, minBar) =>
    float lvl = na
    int lb = na
    n = array.size(prices)
    if n > 0
        for i = n - 1 to 0
            b = array.get(bars, i)
            if b < maxBar and b >= minBar
                lvl := array.get(prices, i)
                lb := b
                break
    [lvl, lb]
[aL, aLb] = soLastBefore(phP, phB, soLoBar, soOpenBar)
[aS, aSb] = soLastBefore(plP, plB, soHiBar, soOpenBar)
soLvlL = sorId != 0 ? aL : na
soLvlLb = sorId != 0 ? aLb : na
soLvlS = sorId != 0 ? aS : na
soLvlSb = sorId != 0 ? aSb : na
soUntapped(lvl, lb, dr) =>
    bool ok = true
    len = bar_index - lb
    if len > 0 and len < 1400
        for j = 0 to len - 1
            if (dr == 1 and high[j] >= lvl) or (dr == -1 and low[j] <= lvl)
                ok := false
                break
    ok
soAddMag(p, side) =>
    array.push(mgP, p)
    array.push(mgS, side)
    array.push(mgB, bar_index)
    if array.size(mgP) > 60
        array.shift(mgP)
        array.shift(mgS)
        array.shift(mgB)
    true
upL = soUntapped(nz(soLvlL[1]), nz(soLvlLb[1]), 1)
upS = soUntapped(nz(soLvlS[1]), nz(soLvlSb[1]), -1)
if sorEnd
    if not na(soLvlL[1]) and not na(soLvlLb[1]) and soRunDn[1] >= 15 and upL
        soAddMag(soLvlL[1], 1)
    if not na(soLvlS[1]) and not na(soLvlSb[1]) and soRunUp[1] >= 15 and upS
        soAddMag(soLvlS[1], -1)
if sorNew
    soAddMag(open, open > close ? 1 : -1)

sorSig(dr, lvl) =>
    bool valid = false
    float s = na
    float tg = na
    bool sf = false
    crossed = dr == 1 ? (close > lvl and close[1] <= lvl and close < soOpen and soRunDn >= 15) : (close < lvl and close[1] >= lvl and close > soOpen and soRunUp >= 15)
    if not na(lvl) and crossed
        e = close
        s := math.round_to_mintick(dr == 1 ? soLo - 1 : soHi + 1)
        sd = (e - s) * dr
        minD = sd * 1.8
        float tN = (soOpen - e) * dr >= minD ? soOpen : na
        if na(tN)
            n = array.size(mgP)
            if n > 0
                for i = 0 to n - 1
                    p = array.get(mgP, i)
                    if (p - e) * dr >= minD and (na(tN) or (p - tN) * dr < 0)
                        tN := p
        tN := na(tN) ? na : math.round_to_mintick(tN)
        float tQ = na
        if soQuiet
            tQ := (na(tN) or (tN - e) * dr > 15) ? math.round_to_mintick(e + dr * 15) : tN
        tg := soQuiet ? tQ : tN
        if sd >= 4 and sd <= 76 and not na(tg)
            valid := true
            sf := not na(soDayAtr) and not na(soEma) and soDayAtr >= 6.75 and (close[1] - soEma) * dr < 0
    [valid, s, tg, sf]
[vL, sL, tL, fL] = sorSig(1, soLvlL)
[vS, sS2, tS, fS] = sorSig(-1, soLvlS)

// first valid signal of the session decides
var bool sorUsed = false
var string sorState = "waiting for first signal"
if sorNew
    sorUsed := false
    sorState := sorId == 2 ? "NY PM: SOR does not trade" : "waiting for first signal"
sorWin = (sorId == 1 or sorId == 3) and not sorNew and soMins < (sorId == 3 ? 150 : 90) and tdowS != dayofweek.thursday
bool sorGo = false
int sorDir = 0
float sorStop = na
float sorTgt = na
if sorWin and not sorUsed and (vL or vS)
    sorUsed := true
    sorDir := vL ? 1 : -1
    sorStop := vL ? sL : sS2
    sorTgt := vL ? tL : tS
    okSafe = vL ? fL : fS
    sorGo := okSafe
    if okSafe and inAlerts
        dwn = tdowS == dayofweek.monday ? "Mon" : tdowS == dayofweek.tuesday ? "Tue" : tdowS == dayofweek.wednesday ? "Wed" : tdowS == dayofweek.thursday ? "Thu" : tdowS == dayofweek.friday ? "Fri" : tdowS == dayofweek.saturday ? "Sat" : "Sun"
        alert("{\"secret\":\"" + secret + "\",\"event\":\"signal\",\"swing\":\"3/3\",\"session\":\"" + sorName + "\",\"dow\":\"" + dwn + "\",\"mins_in\":" + str.tostring(soMins) + ",\"quiet\":false,\"dir\":\"" + (sorDir == 1 ? "LONG" : "SHORT") + "\",\"entry\":" + str.tostring(close) + ",\"stop\":" + str.tostring(sorStop) + ",\"target\":" + str.tostring(sorTgt) + ",\"quiet_target\":null,\"safe_ok\":true,\"first_valid\":true,\"id\":\"" + str.tostring(time) + "-3/3-" + (sorDir == 1 ? "L" : "S") + "\"}", alert.freq_once_per_bar_close)
    sorState := okSafe ? "first signal SAFE ✓" : "first signal not safe ✗, no SOR"
    if inLabels
        label.new(bar_index, sorDir == 1 ? low : high, okSafe ? "SOR " + (sorDir == 1 ? "▲" : "▼") : "✗ sor", style=sorDir == 1 ? label.style_label_up : label.style_label_down, color=okSafe ? color.new(color.purple, 10) : color.new(color.gray, 60), textcolor=color.white, size=size.small, tooltip="SOR " + sorName + " " + (sorDir == 1 ? "LONG" : "SHORT") + "\nfirst valid signal this session\nsafe_ok: " + (okSafe ? "yes" : "no") + "\nstop " + str.tostring(sorStop) + "  target " + str.tostring(sorTgt))
if sorId == 0 and nz(sorId[1]) != 0 and not sorUsed
    sorState := sorId[1] == 2 ? "NY PM: SOR does not trade" : tdowS == dayofweek.thursday ? "Thursday: no SOR" : "no signal that session"

// place the SOR trade (5 MNQ, own stop/target prices, C has priority)
var int nSor = 0
if inSor and sorGo and na(ordQty) and strategy.position_size == 0
    float useT = na
    int sq = 0
    perC = (math.abs(close - sorStop) + 0.25) * 2 + 1.24
    if plainMode
        sq := inSorQty
        useT := sorTgt
    else if stage == "EVAL" and not isLucid and left > 0 and (left >= 25 or finishing)
        sq := room >= perC * inSorQty ? inSorQty : int(math.floor(room / perC))
        if sq >= 1
            capPx = close + sorDir * (left + 1.24 * sq) / (2 * sq)
            capPx := sorDir == 1 ? math.ceil(capPx / syminfo.mintick) * syminfo.mintick : math.floor(capPx / syminfo.mintick) * syminfo.mintick
            useT := sorTgt
            if (capPx - sorTgt) * sorDir < 0
                useT := (capPx - close) * sorDir < 0.5 * math.abs(close - sorStop) and not finishing ? na : capPx
    if sq >= 1 and not na(useT)
        nSor += 1
        nTrades += 1
        strategy.entry("SOR", sorDir == 1 ? strategy.long : strategy.short, qty=sq, comment="SOR " + sorName)
        strategy.exit("SOR out", "SOR", stop=sorStop, limit=useT, comment_loss="SOR stop", comment_profit="SOR target")
        sorState := "TRADED"
        trE := close
        trS := sorStop
        trG := useT
        trDir := sorDir == 1 ? "LONG" : "SHORT"
        trSess := "SOR " + sorName
        trExit := "16:09"
        if inDraw
            endT = timestamp(TZ, year(time, TZ), month(time, TZ), dayofmonth(time, TZ), 16, 9)
            usdS = (math.abs(close - sorStop) + 0.25) * 2 * sq
            usdG = math.abs(useT - close) * 2 * sq
            bxT := box.new(time, math.max(trE, trG), endT, math.min(trE, trG), xloc=xloc.bar_time, border_color=color.new(color.lime, 40), border_style=line.style_dashed, bgcolor=color.new(color.lime, 85), text="SOR TARGET " + str.tostring(trG, "#,###.##") + "  +$" + str.tostring(usdG, "#,###"), text_color=color.lime, text_size=size.small, text_halign=text.align_right, text_valign=sorDir == 1 ? text.align_top : text.align_bottom)
            bxS := box.new(time, math.max(trE, trS), endT, math.min(trE, trS), xloc=xloc.bar_time, border_color=color.new(color.fuchsia, 40), border_style=line.style_dashed, bgcolor=color.new(color.fuchsia, 85), text="SOR STOP " + str.tostring(trS, "#,###.##") + "  -$" + str.tostring(usdS, "#,###"), text_color=color.fuchsia, text_size=size.small, text_halign=text.align_right, text_valign=sorDir == 1 ? text.align_bottom : text.align_top)
            lnE := line.new(time, trE, endT, trE, xloc=xloc.bar_time, color=color.white, style=line.style_dotted, width=1)
if at(16, 8)
    strategy.close("SOR", comment="SOR 16:09 exit")

// ---------------- signal labels (hover a label for the full reason) ----------------
if sess != "" and inLabels
    tip = sess + " " + dir + "\n4H bias: " + (bias == "null" ? "flat" : str.replace_all(bias, "\"", "")) + (agrees ? "  ✓ agrees" : "  ✗ against") + "\nValue area " + num(vaL) + " – " + num(vaH) + (outside ? "\nprice outside ✓" : "\nprice inside ✗") + (cOk ? "\nTAKEN" : "\nSKIPPED")
    lt = cOk ? sess + (dir == "LONG" ? " ▲" : " ▼") : "✗ " + sess
    label.new(bar_index, dir == "LONG" ? low : high, lt, style=dir == "LONG" ? label.style_label_up : label.style_label_down, color=cOk ? color.new(dir == "LONG" ? color.teal : color.maroon, 10) : color.new(color.gray, 55), textcolor=color.white, size=size.small, tooltip=tip)

// ---------------- live "next trade" panel + what it's looking at on the chart ----------------
biasState(want, sS, sO, sC) =>
    int b = 0
    string st = "not formed yet"
    if not na(sS) and sS == want
        b := sC > sO ? 1 : sC < sO ? -1 : 0
        st := "final"
    else if not na(curS) and curS == want
        b := curC > curO ? 1 : curC < curO ? -1 : 0
        st := "still forming"
    [b, st]
dayAtHM(n, h, mi) =>
    t0 = time + n * 86400000
    timestamp(TZ, year(t0, TZ), month(t0, TZ), dayofmonth(t0, TZ), h, mi)
fmtP(x) => str.tostring(x, "#,###.##")

var int vaStartBar = na
if at(20, 0)
    vaStartBar := bar_index

cGrey = color.new(color.gray, 25)
cBg = color.new(#131722, 5)
var table nx = table.new(position.bottom_right, 2, 8, bgcolor=cBg, frame_color=color.new(color.gray, 70), frame_width=1, border_color=color.new(color.gray, 88), border_width=1)
nxRow(r, a, b, col, bg) =>
    table.cell(nx, 0, r, a, text_color=cGrey, text_halign=text.align_left, text_size=size.small, bgcolor=bg)
    table.cell(nx, 1, r, b, text_color=col, text_halign=text.align_left, text_size=size.small, bgcolor=bg)
    true

var box bxVA = na
var line lnR = na
var label lbR = na
var line lnSig = na
var label lbSig = na
var line gS = na
var line gT = na
var label gSl = na
var label gTl = na
if barstate.islast and inPanel
    box.delete(bxVA)
    line.delete(lnR)
    label.delete(lbR)
    line.delete(lnSig)
    label.delete(lbSig)
    line.delete(gS)
    line.delete(gT)
    label.delete(gSl)
    label.delete(gTl)
    m = hr * 60 + mn
    int which = 0
    string sName = ""
    int want = 0
    int sS = na
    float sO = na
    float sC = na
    float ref = na
    string refName = "Reference"
    int sigT = na
    if m >= 610 and m < 1200
        which := 0
        sName := dow == dayofweek.friday or dow == dayofweek.saturday ? "ASIA · Sunday 20:00" : "ASIA · 20:00"
        want := dow == dayofweek.sunday ? dayAtBack(14, 2) : dow == dayofweek.saturday ? dayAtBack(14, 1) : dayAt(14)
        sS := c14s
        sO := c14o
        sC := c14c
        sigT := dow == dayofweek.friday or dow == dayofweek.saturday ? na : dayAtHM(0, 20, 0)
    else if m >= 1200 or m < 210
        which := 1
        sName := "LONDON · 03:30"
        want := m >= 1200 ? dayAt(22) : dayAt(2) - 4 * 3600000
        sS := c22s
        sO := c22o
        sC := c22c
        ref := lonRef
        refName := "03:01 open"
        sigT := m >= 1200 ? dayAtHM(1, 3, 30) : dayAtHM(0, 3, 30)
    else
        which := 2
        sName := "NEW YORK · 10:10"
        want := dayAt(2)
        sS := c02s
        sO := c02o
        sC := c02c
        ref := nyRef
        refName := "09:41 open"
        sigT := dayAtHM(0, 10, 10)
    [b, st] = biasState(want, sS, sO, sC)
    [vl, vh] = vaOf()
    gd = which == 0 ? (b == 1 ? 1 : 0) : b
    nowOut = not na(vh) and (close > vh or close < vl)
    bool dirOk = false
    if which == 0
        dirOk := b == 1
    else if not na(ref)
        dirOk := b == 1 ? (which == 1 ? close <= ref : close >= ref) : b == -1 ? (which == 1 ? close > ref : close < ref) : false
    string need = ""
    if which == 0
        need := b == 1 ? "▲ LONG (Asia only goes long)" : b == -1 ? "nothing, 4H down and Asia only longs" : "waiting on the 14:00 candle"
    else if which == 1
        need := b == 1 ? "▲ LONG if 03:30 close ≤ 03:01 open" : b == -1 ? "▼ SHORT if 03:30 close > 03:01 open" : "4H flat, no trade"
    else
        need := b == 1 ? "▲ LONG if 10:10 close ≥ 09:41 open" : b == -1 ? "▼ SHORT if 10:10 close < 09:41 open" : "4H flat, no trade"
    stopPts = plainMode ? stopPtsE : stopTOf(stage) * 0.25
    tgtPts = math.ceil((1640.0 + inQty * 1.0) / (inQty * 2) / 0.25 - 1e-9) * 0.25
    inPos = strategy.position_size != 0
    if inPos
        op = strategy.openprofit
        nxRow(0, "IN TRADE", trSess + "  " + (trDir == "LONG" ? "▲ LONG" : "▼ SHORT"), color.white, color.new(trDir == "LONG" ? color.teal : color.maroon, 20))
        nxRow(1, "Entry", fmtP(trE), color.white, cBg)
        nxRow(2, "Stop", fmtP(trS) + "   (" + str.tostring(math.abs(trE - trS)) + " pts)", color.red, cBg)
        nxRow(3, "Target", fmtP(trG) + "   (" + str.tostring(math.abs(trG - trE)) + " pts)", color.lime, cBg)
        nxRow(4, "Time exit", trExit + " New York", color.white, cBg)
        nxRow(5, "Open P&L", (op >= 0 ? "+$" : "-$") + str.tostring(math.abs(op), "#,###"), op >= 0 ? color.lime : color.red, cBg)
        nxRow(6, "After this", sName, cGrey, cBg)
        nxRow(7, "SOR " + (sorId == 0 ? "last session" : sorName), inSor ? sorState : "off", cGrey, cBg)
    else
        nxRow(0, "NEXT", sName + " New York", color.yellow, color.new(color.yellow, 85))
        nxRow(1, "4H bias", (b == 1 ? "▲ UP" : b == -1 ? "▼ DOWN" : "– none") + "   " + st, b == 1 ? color.lime : b == -1 ? color.red : cGrey, cBg)
        nxRow(2, "Needs", need, color.white, cBg)
        nxRow(3, which == 0 ? "Reference" : refName, which == 0 ? "none for Asia" : na(ref) ? "sets at " + (which == 1 ? "03:01" : "09:41") : fmtP(ref) + "   price " + (close > ref ? "above" : close < ref ? "below" : "on it") + (b == 0 ? "" : dirOk ? "  ✓" : "  ✗"), which == 0 ? cGrey : na(ref) ? cGrey : dirOk ? color.lime : color.orange, cBg)
        nxRow(4, "Value area", na(vh) ? "building" : fmtP(vl) + " – " + fmtP(vh) + (nowOut ? "   outside ✓" : "   inside ✗"), na(vh) ? cGrey : nowOut ? color.lime : color.orange, cBg)
        takeNow = dirOk and nowOut
        nxRow(5, "If it fired now", takeNow ? "TAKE  " + (gd == 1 ? "▲ LONG" : "▼ SHORT") : "SKIP" + (b == 0 or not dirOk ? "  (direction)" : "") + (nowOut ? "" : "  (inside value)"), color.white, color.new(takeNow ? color.green : color.red, 55))
        nxRow(6, "Stop / target", str.tostring(stopPts) + " pts / " + str.tostring(tgtPts) + " pts", cGrey, cBg)
        nxRow(7, "SOR " + (sorId == 0 ? "last session" : sorName), inSor ? sorState : "off", sorState == "first signal SAFE ✓" or sorState == "TRADED" ? color.fuchsia : cGrey, cBg)
        // faint "if it fired now" stop and target from the current price
        if gd != 0
            gs = close - gd * stopPts
            gt = close + gd * tgtPts
            gS := line.new(bar_index, gs, bar_index + 25, gs, color=color.new(color.red, 40), style=line.style_dotted, width=1)
            gT := line.new(bar_index, gt, bar_index + 25, gt, color=color.new(color.lime, 40), style=line.style_dotted, width=1)
            gSl := label.new(bar_index + 25, gs, "stop if fired now", style=label.style_label_left, color=color.new(color.black, 100), textcolor=color.new(color.red, 30), size=size.tiny)
            gTl := label.new(bar_index + 25, gt, "target if fired now", style=label.style_label_left, color=color.new(color.black, 100), textcolor=color.new(color.lime, 30), size=size.tiny)
    // value area = the skip zone (price has to be outside it)
    if not na(vh)
        x0 = na(vaStartBar) ? bar_index - 200 : vaStartBar
        bxVA := box.new(x0, vh, bar_index + 25, vl, border_color=color.new(color.orange, 50), border_style=line.style_dashed, bgcolor=color.new(color.orange, 92), text="value area · must be outside", text_color=color.new(color.orange, 30), text_size=size.small, text_halign=text.align_left, text_valign=text.align_top)
    if not na(ref) and which != 0
        lnR := line.new(bar_index - 120, ref, bar_index + 25, ref, color=color.aqua, style=line.style_dotted, width=1)
        lbR := label.new(bar_index + 25, ref, refName, style=label.style_label_left, color=color.new(color.black, 100), textcolor=color.aqua, size=size.tiny)
    if not na(sigT) and not inPos
        lnSig := line.new(sigT, close, sigT, close + 1, xloc=xloc.bar_time, extend=extend.both, color=color.new(color.yellow, 50), style=line.style_dotted, width=1)
        lbSig := label.new(sigT, nz(vh, high), (which == 0 ? "20:00" : which == 1 ? "03:30" : "10:10") + " signal", xloc=xloc.bar_time, style=label.style_label_down, color=color.new(color.yellow, 75), textcolor=color.yellow, size=size.tiny)

// ---------------- stats (top right) ----------------
var table t = table.new(position.top_right, 2, 13, bgcolor=cBg, frame_color=color.new(color.gray, 70), frame_width=1, border_color=color.new(color.gray, 88), border_width=1)
tRow(r, a, b, col) =>
    table.cell(t, 0, r, a, text_color=cGrey, text_halign=text.align_left, text_size=size.small)
    table.cell(t, 1, r, b, text_color=col, text_halign=text.align_right, text_size=size.small)
    true
if barstate.islast
    weeks = math.max((time - firstTime) / (7 * 86400000.0), 1)
    nAll = nW + nL
    pfNow = gL > 0 ? gW / gL : na
    streakTxt = cur > 0 ? str.tostring(cur) + (cur == 1 ? " win" : " wins") : cur < 0 ? str.tostring(-cur) + (cur == -1 ? " loss" : " losses") : "–"
    avgW = wRuns > 0 ? nW * 1.0 / wRuns : 0.0
    avgL = lRuns > 0 ? nL * 1.0 / lRuns : 0.0
    table.cell(t, 0, 0, "C + SOR TEST", text_color=color.yellow, text_halign=text.align_left, text_size=size.small, bgcolor=color.new(color.yellow, 85))
    table.cell(t, 1, 0, plainMode ? "every C trade" : stage + " · " + inFirm + (isLucid ? "" : inDll ? " DLL" : ""), text_color=color.yellow, text_halign=text.align_right, text_size=size.small, bgcolor=color.new(color.yellow, 85))
    if plainMode
        netNow = strategy.netprofit
        tRow(1, "Trades on chart", str.tostring(nAll) + "   (" + str.tostring(nW) + " W / " + str.tostring(nL) + " L)", color.white)
        tRow(2, "Win rate", nAll > 0 ? str.tostring(100.0 * nW / nAll, "#.#") + "%" : "–", color.white)
        tRow(3, "Net P&L", (netNow >= 0 ? "+$" : "-$") + str.tostring(math.abs(netNow), "#,###"), netNow >= 0 ? color.lime : color.red)
        tRow(4, "Profit factor", na(pfNow) ? "–" : str.tostring(pfNow, "#.##"), color.white)
        tRow(5, "Streak now", streakTxt, cur > 0 ? color.lime : cur < 0 ? color.red : cGrey)
        tRow(6, "Most wins in a row", str.tostring(maxW) + "   (avg " + str.tostring(avgW, "#.#") + ")", color.lime)
        tRow(7, "Most losses in a row", str.tostring(maxL) + "   (avg " + str.tostring(avgL, "#.#") + ")", color.red)
        tRow(8, "Trades per week", str.tostring(nTrades / weeks, "#.#"), color.white)
        tRow(9, "7-yr streaks", "max 10 W / 7 L", cGrey)
        tRow(10, "7-yr eval pass C / C+SOR", "50.4% / 52.1% (no DLL)", cGrey)
    else
        fee = isLucid ? 180 : 120
        tRow(1, "Profit this stage", (prof >= 0 ? "+$" : "-$") + str.tostring(math.abs(prof), "#,###"), prof >= 0 ? color.lime : color.red)
        tRow(2, "Today / day goal", "$" + str.tostring(today, "#,###") + " / $" + str.tostring(math.max(goal, 0), "#,###"), color.white)
        tRow(3, "Best day / winning days", "$" + str.tostring(bestNow, "#,###") + " / " + str.tostring(winNow), color.white)
        tRow(4, "Evals bought", str.tostring(evals) + "   ($" + str.tostring(evals * fee, "#,###") + ")", color.white)
        tRow(5, "Passed", str.tostring(passes), color.lime)
        tRow(6, isLucid ? "Pre-live done" : "Payouts", str.tostring(payouts), color.lime)
        tRow(7, "Blown (out of room)", str.tostring(blown) + " (" + str.tostring(stuck) + ")", color.red)
        tRow(8, "Streak now", streakTxt, cur > 0 ? color.lime : cur < 0 ? color.red : cGrey)
        tRow(9, "Most W / L in a row", str.tostring(maxW) + " / " + str.tostring(maxL), color.white)
        tRow(10, "Trades per week", str.tostring(nTrades / weeks, "#.#"), color.white)
    tRow(11, "C trades (W) · net", str.tostring(cN) + " (" + str.tostring(cW) + ") · $" + str.tostring(cNet, "#,###"), color.white)
    tRow(12, "SOR trades (W) · net", str.tostring(sorN) + " (" + str.tostring(sorW) + ") · $" + str.tostring(sorNet, "#,###"), color.fuchsia)
`;
