"""
T1 結構分析純函式測試（合成 bars，無需 DB）。
"""
from app.services.structure import (
    find_swings,
    support_resistance_zones,
    trendlines,
    detect_gaps,
    detect_range_box,
    atr,
)


def _bar(o, h, l, c, v=1000, d="2026-01-01"):
    return {"date": d, "open": o, "high": h, "low": l, "close": c, "volume": v}


def _flat(price, n, v=1000):
    return [_bar(price, price, price, price, v, f"d{i}") for i in range(n)]


# ── find_swings ──────────────────────────────────────────────
def test_find_swings_zigzag():
    # 三角波：100→104→100，週期 8，峰在 phase4、谷在 phase0
    pattern = [100, 101, 102, 103, 104, 103, 102, 101]
    vals = [pattern[i % 8] for i in range(40)]
    bars = [_bar(v, v, v, v, 1000, f"d{i}") for i, v in enumerate(vals)]
    swings = find_swings(bars, left=3, right=3)
    highs = {s["index"] for s in swings if s["kind"] == "high"}
    lows = {s["index"] for s in swings if s["kind"] == "low"}
    assert {4, 12, 20, 28, 36} <= highs
    assert {8, 16, 24, 32} <= lows


def test_find_swings_insufficient():
    assert find_swings(_flat(100, 3)) == []


# ── support_resistance_zones ─────────────────────────────────
def test_zones_merge_cluster():
    bars = _flat(100, 30)
    swings = [
        {"index": 5, "price": 100.0, "kind": "low", "date": "d5"},
        {"index": 12, "price": 100.5, "kind": "low", "date": "d12"},
        {"index": 19, "price": 99.7, "kind": "low", "date": "d19"},
        {"index": 25, "price": 130.0, "kind": "high", "date": "d25"},  # 單一觸及 → 應被丟棄
    ]
    zones = support_resistance_zones(bars, swings, merge_pct=0.015, min_touches=2, atr_val=1.0)
    assert len(zones) == 1
    assert zones[0]["touches"] == 3
    assert 99 <= zones[0]["center"] <= 101


def test_zones_separate_when_far():
    bars = _flat(100, 30)
    swings = [
        {"index": 5, "price": 100.0, "kind": "low", "date": "d5"},
        {"index": 8, "price": 100.3, "kind": "low", "date": "d8"},
        {"index": 20, "price": 130.0, "kind": "high", "date": "d20"},
        {"index": 23, "price": 130.4, "kind": "high", "date": "d23"},
    ]
    zones = support_resistance_zones(bars, swings, merge_pct=0.015, min_touches=2, atr_val=1.0)
    assert len(zones) == 2


# ── trendlines ───────────────────────────────────────────────
def test_trendlines_uptrend():
    bars = _flat(100, 30)
    swings = [{"index": i * 5, "price": 100 + i * 2, "kind": "low", "date": f"d{i*5}"} for i in range(5)]
    tl = trendlines(bars, swings, lookback=200)
    assert tl["uptrend"] is not None
    assert tl["uptrend"]["slope"] > 0
    assert tl["uptrend"]["r2"] >= 0.9


def test_trendlines_choppy_none():
    bars = _flat(100, 30)
    swings = [{"index": i * 5, "price": 100 + (3 if i % 2 else -3), "kind": "low", "date": f"d{i*5}"} for i in range(5)]
    tl = trendlines(bars, swings, lookback=200)
    assert tl["uptrend"] is None


# ── detect_gaps ──────────────────────────────────────────────
def test_detect_gap_up_and_fill():
    bars = _flat(100, 10)
    bars.append(_bar(106, 107, 105, 106, 3000, "d10"))   # 向上跳空：low105 > 前 high100
    bars += [_bar(106, 107, 105, 106, 1000, f"d{i}") for i in range(11, 15)]
    bars.append(_bar(104, 104, 99, 99, 1000, "d15"))      # 回補：low99 <= 100
    bars += _flat(99, 6)
    gaps = detect_gaps(bars)
    up_gaps = [g for g in gaps if g["direction"] == "up"]
    assert up_gaps and up_gaps[0]["filled"] is True
    assert up_gaps[0]["fill_date"] == "d15"


# ── detect_range_box ─────────────────────────────────────────
def test_range_box_detected():
    bars = [_bar(100, 102, 98, 100 + (1 if i % 2 else -1), 1000, f"d{i}") for i in range(60)]
    box = detect_range_box(bars, window=60, band_pct=0.08)
    assert box is not None
    assert box["top"] == 102 and box["bottom"] == 98


def test_range_box_none_when_trending():
    bars = [_bar(100 + i, 101 + i, 99 + i, 100 + i, 1000, f"d{i}") for i in range(60)]
    assert detect_range_box(bars, window=60, band_pct=0.08) is None


# ── atr ──────────────────────────────────────────────────────
def test_atr_basic():
    bars = [_bar(100, 105, 95, 100, 1000, f"d{i}") for i in range(20)]
    assert atr(bars, 14) == 10.0
