/** The TradingView script "MNQ Pass Plan - Signals [1m]" (Pine v5), shown on the Pass plan page to copy. Keep in step with public/pass-plan-signals.pine. */
export const PASS_PINE = String.raw`//@version=5
// =============================================================================
//  MNQ PASS PLAN - SIGNALS [1m]   (scripts C and D, rules pack 11 Nov 2026)
//  One alert sends every Pass Plan signal: Asia, London and New York, each
//  with the last finished 4H candle's bias and the value area. It doesn't know
//  your accounts: the journal holds each account's stage (eval / funded /
//  pre-live) and script (C or D), works out its stop and target, and your Mac
//  places the orders.
//
//  Chart: CME_MINI:MNQ1!, 1 minute.
//  Alert: Condition = this script -> "Any alert() function call",
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
indicator("MNQ Pass Plan - Signals [1m]", overlay=true, max_labels_count=300)

secret = input.string("", "Webhook Secret (same as BOT_WEBHOOK_SECRET in Vercel)")

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
if sess != ""
    tday = str.format_time(time + 6 * 3600000, "yyyy-MM-dd", TZ)
    msg = "{\"secret\":\"" + secret + "\",\"event\":\"pass\",\"session\":\"" + sess + "\",\"trading_day\":\"" + tday + "\",\"dir\":\"" + dir + "\",\"price\":" + str.tostring(close) + ",\"bias\":" + bias + ",\"vah\":" + num(vaH) + ",\"val\":" + num(vaL) + ",\"id\":\"" + str.tostring(time) + "-" + sess + "\"}"
    alert(msg, alert.freq_once_per_bar_close)
    outside = not na(vaH) and (close > vaH or close < vaL)
    agrees = (dir == "LONG" and bias == "\"UP\"") or (dir == "SHORT" and bias == "\"DOWN\"")
    txt = sess + " " + dir + "\n4H " + (bias == "null" ? "flat" : str.replace_all(bias, "\"", "")) + (agrees ? " ✓" : " ✗") + "\nVA " + num(vaL) + "-" + num(vaH) + (outside ? " out ✓" : " in ✗")
    label.new(bar_index, dir == "LONG" ? low : high, txt, style=dir == "LONG" ? label.style_label_up : label.style_label_down, color=color.new(dir == "LONG" ? color.teal : color.maroon, 15), textcolor=color.white, size=size.small)
`;
