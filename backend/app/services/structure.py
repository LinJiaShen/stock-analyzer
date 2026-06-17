"""
結構分析服務（技術面「型態結構」層）

把「指標讀數」升級為「結構認知」：擺盪點(swing)、支撐壓力區帶、趨勢線/通道、
跳空缺口、箱型整理。所有運算為**純函式**吃 `bars: list[dict]`
（{date, open, high, low, close, volume}），`StructureService(db)` 只做薄 DB 包裝，
重用 `TechnicalService._fetch_bars`（走 adjusted_close）+ `_aggregate_bars`。

設計慣例（比照 technical.py / risk.py）：
- 資料不足一律 min-length guard → 回空陣列 / None / {"has_data": false}，**不 raise**。
- swing 為單一真相來源，T4 背離、T5 交易劇本共用，不重複偵測。
"""
from __future__ import annotations

import logging

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def atr(bars: list[dict], period: int = 14) -> float:
    """平均真實波幅 ATR（與 scoring._calculate_atr 同邏輯，獨立純函式以保持本模組自足）。"""
    trs: list[float] = []
    for i in range(1, len(bars)):
        h = bars[i].get("high") or 0
        l = bars[i].get("low") or 0
        pc = bars[i - 1].get("close") or 0
        if h == 0 and l == 0:
            continue
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    if not trs:
        return 0.0
    return float(np.mean(trs[-period:]))


def find_swings(bars: list[dict], left: int = 3, right: int = 3) -> list[dict]:
    """
    fractal pivots：
    - swing high：bar i 的 high 嚴格大於左側 `left` 根、且 ≥ 右側 `right` 根（右側容許等高，避免高原重複計）。
    - swing low：對稱（嚴格小於左、≤ 右）。
    末 `right` 根因右側未補滿 → `provisional=True`（顯示可用、趨勢線/背離應優先採用已確認點）。

    回傳依 index 排序的 [{index, date, price, kind: 'high'|'low', provisional}]。
    """
    n = len(bars)
    swings: list[dict] = []
    if n < left + 2:
        return swings
    highs = [(b.get("high") or b.get("close") or 0) for b in bars]
    lows = [(b.get("low") or b.get("close") or 0) for b in bars]

    for i in range(left, n):
        lo = i - left
        hi = min(n - 1, i + right)

        is_high = all(highs[j] < highs[i] for j in range(lo, i)) and all(
            highs[j] <= highs[i] for j in range(i + 1, hi + 1)
        )
        is_low = all(lows[j] > lows[i] for j in range(lo, i)) and all(
            lows[j] >= lows[i] for j in range(i + 1, hi + 1)
        )
        provisional = (i + right) > (n - 1)

        if is_high:
            swings.append({"index": i, "date": str(bars[i]["date"]), "price": round(float(highs[i]), 2),
                           "kind": "high", "provisional": provisional})
        if is_low:
            swings.append({"index": i, "date": str(bars[i]["date"]), "price": round(float(lows[i]), 2),
                           "kind": "low", "provisional": provisional})
    return swings


def support_resistance_zones(
    bars: list[dict],
    swings: list[dict] | None = None,
    merge_pct: float = 0.015,
    min_touches: int = 2,
    max_zones: int = 6,
    atr_val: float | None = None,
) -> list[dict]:
    """
    把擺盪點以**相對門檻**（merge_pct，跨高價/低價股皆適用）聚合成「價格區帶」。
    每個區帶：low/high（寬度至少 0.3×ATR 以便畫帶與容錯）、center、touches、最後觸及、
    strength(0-100，由 觸及次數/新近度/距現價遠近 加權)、kind(support/resistance vs 現價)。
    取代 scoring 目前「近 20 根 min/max」的粗略支撐壓力。
    """
    if len(bars) < 10:
        return []
    if swings is None:
        swings = find_swings(bars)
    if atr_val is None:
        atr_val = atr(bars)

    pts = sorted(swings, key=lambda s: s["price"])
    if not pts:
        return []

    cur_price = bars[-1].get("close") or 0
    n = len(bars)

    # 相對門檻凝聚式分群（chaining）
    clusters: list[list[dict]] = []
    group = [pts[0]]
    for p in pts[1:]:
        ref = group[-1]["price"]
        if ref > 0 and abs(p["price"] - ref) / ref <= merge_pct:
            group.append(p)
        else:
            clusters.append(group)
            group = [p]
    clusters.append(group)

    min_band = max(0.3 * atr_val, cur_price * 0.003)
    zones: list[dict] = []
    for g in clusters:
        touches = len(g)
        if touches < min_touches:
            continue
        prices = [x["price"] for x in g]
        lo, hi = min(prices), max(prices)
        center = float(np.mean(prices))
        if hi - lo < min_band:
            pad = (min_band - (hi - lo)) / 2
            lo -= pad
            hi += pad
        last_idx = max(x["index"] for x in g)
        recency = last_idx / max(n - 1, 1)
        dist_pct = (abs(center - cur_price) / cur_price * 100) if cur_price else 0.0
        proximity = max(0.0, 1 - dist_pct / 20)
        strength = round(min(100.0, 100 * (0.5 * min(touches / 4, 1) + 0.3 * recency + 0.2 * proximity)), 1)
        zones.append({
            "low": round(lo, 2), "high": round(hi, 2), "center": round(center, 2),
            "touches": touches, "last_touch_index": last_idx,
            "last_touch_date": str(bars[last_idx]["date"]),
            "strength": strength,
            "kind": "support" if center < cur_price else "resistance",
            "distance_pct": round((center - cur_price) / cur_price * 100, 2) if cur_price else None,
        })

    zones.sort(key=lambda z: z["strength"], reverse=True)
    zones = zones[:max_zones]
    zones.sort(key=lambda z: z["center"])
    return zones


def trendlines(
    bars: list[dict],
    swings: list[dict] | None = None,
    lookback: int = 120,
    min_points: int = 3,
    min_r2: float = 0.5,
) -> dict:
    """
    以 `np.polyfit` 一次回歸擬合：上升支撐線（過 swing lows）、下降壓力線（過 swing highs）。
    僅在 R²≥min_r2 且斜率方向正確時採用。並以對側擺盪點最大殘差平行偏移出通道線。
    端點回傳 {date, price} 供前端畫線（延伸到最後一根）。
    """
    n = len(bars)
    empty = {"uptrend": None, "downtrend": None, "channel": None}
    if n < 20:
        return empty
    if swings is None:
        swings = find_swings(bars)

    start = max(0, n - lookback)
    lows = [s for s in swings if s["kind"] == "low" and s["index"] >= start]
    highs = [s for s in swings if s["kind"] == "high" and s["index"] >= start]

    def fit(points: list[dict], want_sign: int):
        if len(points) < min_points:
            return None
        xs = np.array([p["index"] for p in points], dtype=float)
        ys = np.array([p["price"] for p in points], dtype=float)
        slope, intercept = np.polyfit(xs, ys, 1)
        pred = slope * xs + intercept
        ss_res = float(np.sum((ys - pred) ** 2))
        ss_tot = float(np.sum((ys - np.mean(ys)) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
        if r2 < min_r2:
            return None
        if (want_sign > 0 and slope <= 0) or (want_sign < 0 and slope >= 0):
            return None
        i1 = int(xs.min())
        i2 = n - 1
        return {
            "slope": round(float(slope), 4), "intercept": round(float(intercept), 2), "r2": round(r2, 3),
            "p1": {"date": str(bars[i1]["date"]), "price": round(float(slope * i1 + intercept), 2)},
            "p2": {"date": str(bars[i2]["date"]), "price": round(float(slope * i2 + intercept), 2)},
        }

    up = fit(lows, +1)
    down = fit(highs, -1)

    channel = None
    if up and highs:
        resid = [p["price"] - (up["slope"] * p["index"] + up["intercept"]) for p in highs]
        off = max(resid)
        i1 = int(min(p["index"] for p in lows))
        channel = {
            "basis": "up",
            "p1": {"date": str(bars[i1]["date"]), "price": round(up["slope"] * i1 + up["intercept"] + off, 2)},
            "p2": {"date": str(bars[n - 1]["date"]), "price": round(up["slope"] * (n - 1) + up["intercept"] + off, 2)},
        }
    elif down and lows:
        resid = [p["price"] - (down["slope"] * p["index"] + down["intercept"]) for p in lows]
        off = min(resid)
        i1 = int(min(p["index"] for p in highs))
        channel = {
            "basis": "down",
            "p1": {"date": str(bars[i1]["date"]), "price": round(down["slope"] * i1 + down["intercept"] + off, 2)},
            "p2": {"date": str(bars[n - 1]["date"]), "price": round(down["slope"] * (n - 1) + down["intercept"] + off, 2)},
        }

    return {"uptrend": up, "downtrend": down, "channel": channel}


def detect_gaps(bars: list[dict], min_gap_pct: float = 0.01, max_gaps: int = 12) -> list[dict]:
    """跳空缺口偵測 + 分類(common/breakaway/runaway/exhaustion，以位置+量能啟發式) + 是否回補。"""
    n = len(bars)
    gaps: list[dict] = []
    if n < 5:
        return gaps

    for i in range(1, n):
        ph = bars[i - 1].get("high") or 0
        pl = bars[i - 1].get("low") or 0
        ch = bars[i].get("high") or 0
        cl = bars[i].get("low") or 0
        prev_close = bars[i - 1].get("close") or 0
        if prev_close <= 0:
            continue

        if cl > ph:
            direction, lower, upper = "up", ph, cl
        elif ch < pl:
            direction, lower, upper = "down", ch, pl
        else:
            continue

        size_pct = (upper - lower) / prev_close * 100
        if size_pct < min_gap_pct * 100:
            continue

        vol = bars[i].get("volume") or 0
        prior = [b.get("volume") or 0 for b in bars[max(0, i - 20):i]]
        avgvol = float(np.mean(prior)) if prior else 0.0
        vol_ratio = (vol / avgvol) if avgvol > 0 else 1.0

        filled, fill_date = False, None
        for j in range(i + 1, n):
            if direction == "up" and (bars[j].get("low") or 0) <= lower:
                filled, fill_date = True, str(bars[j]["date"])
                break
            if direction == "down" and (bars[j].get("high") or 0) >= upper:
                filled, fill_date = True, str(bars[j]["date"])
                break

        kind = "common"
        if vol_ratio >= 1.5:
            kind = "exhaustion" if i >= n * 0.8 else "breakaway"
        elif vol_ratio >= 1.2 and not filled:
            kind = "runaway"

        gaps.append({
            "index": i, "date": str(bars[i]["date"]), "direction": direction,
            "lower": round(lower, 2), "upper": round(upper, 2), "size_pct": round(size_pct, 2),
            "kind": kind, "vol_ratio": round(vol_ratio, 2),
            "filled": filled, "fill_date": fill_date,
        })

    return gaps[-max_gaps:]


def detect_range_box(bars: list[dict], window: int = 60, band_pct: float = 0.08, min_bars: int = 20) -> dict | None:
    """箱型整理：近 window 根高低帶寬 ≤ band_pct（相對中值）視為箱型，回 top/bottom/mid/觸及次數。"""
    n = len(bars)
    if n < min_bars:
        return None
    seg = bars[-min(window, n):]
    highs = [b.get("high") or 0 for b in seg]
    lows = [b.get("low") or 0 for b in seg]
    top, bottom = max(highs), min(lows)
    mid = (top + bottom) / 2
    if mid <= 0:
        return None
    band = (top - bottom) / mid
    if band > band_pct:
        return None
    tol = (top - bottom) * 0.15 or mid * 0.01
    touches = sum(1 for h in highs if abs(h - top) <= tol) + sum(1 for l in lows if abs(l - bottom) <= tol)
    return {
        "top": round(top, 2), "bottom": round(bottom, 2), "mid": round(mid, 2),
        "band_pct": round(band * 100, 2), "touches": touches,
        "start_date": str(seg[0]["date"]), "end_date": str(seg[-1]["date"]),
    }


class StructureService:
    """薄 DB 包裝：抓 bars（adjusted_close）→ 聚合 interval → 跑純函式。"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze(self, stock_code: str, interval: str = "1d", lookback: int = 250) -> dict:
        from app.services.technical import TechnicalService

        tech = TechnicalService(self.db)
        mult = {"1d": 1, "1w": 7, "1mo": 31}.get(interval, 1)
        daily = await tech._fetch_bars(stock_code, lookback * mult + 90)
        bars = tech._aggregate_bars(daily, interval)

        if not bars or len(bars) < 20:
            return {"stock_code": stock_code, "interval": interval, "has_data": False,
                    "message": "數據不足，至少需要 20 根 K 線"}

        if lookback and len(bars) > lookback:
            bars = bars[-lookback:]

        swings = find_swings(bars)
        atr_val = atr(bars)
        cur = bars[-1].get("close") or 0
        return {
            "stock_code": stock_code, "interval": interval, "has_data": True,
            "bars_count": len(bars),
            "current_price": round(float(cur), 2),
            "atr_14": round(float(atr_val), 2),
            "swings": swings,
            "zones": support_resistance_zones(bars, swings, atr_val=atr_val),
            "trendlines": trendlines(bars, swings),
            "gaps": detect_gaps(bars),
            "range_box": detect_range_box(bars),
            "patterns_classic": [],  # T1.5 best-effort 預留
        }
