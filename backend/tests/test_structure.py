"""
T1 結構分析純函式測試（合成 bars，無需 DB）。
"""
from app.services.structure import (
    find_swings,
    support_resistance_zones,
    trendlines,
    detect_gaps,
    detect_range_box,
    find_divergences,
    bollinger_features,
    detect_classic_patterns,
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


# ── find_divergences ─────────────────────────────────────────
def test_divergence_bullish():
    # 兩個 swing low：index5(低點99)、index14(更低點94)，但 RSI 在第二低點更高 → 底背離
    prices = [110, 108, 106, 104, 102, 100, 103, 106, 108, 110, 108, 104, 100, 97, 95, 98, 101, 104, 107, 110]
    bars = [_bar(p, p + 1, p - 1, p, 1000, f"d{i}") for i, p in enumerate(prices)]
    swings = find_swings(bars, left=3, right=3)
    rsi = [50.0] * 20
    rsi[5] = 30.0
    rsi[14] = 40.0  # 價更低、RSI 更高
    divs = find_divergences(bars, rsi, [0.0] * 20, swings, min_gap=4)
    assert any(d["kind"] == "bullish" and d["indicator"] == "rsi" for d in divs)


def test_divergence_none_when_confirming():
    # 價更低、RSI 也更低（量價同步下跌）→ 無底背離
    prices = [110, 108, 106, 104, 102, 100, 103, 106, 108, 110, 108, 104, 100, 97, 95, 98, 101, 104, 107, 110]
    bars = [_bar(p, p + 1, p - 1, p, 1000, f"d{i}") for i, p in enumerate(prices)]
    swings = find_swings(bars, left=3, right=3)
    rsi = [50.0] * 20
    rsi[5] = 45.0
    rsi[14] = 30.0  # RSI 也更低 → 確認下跌、非背離
    divs = find_divergences(bars, rsi, [0.0] * 20, swings, min_gap=4)
    assert not any(d["kind"] == "bullish" for d in divs)


# ── bollinger_features ───────────────────────────────────────
def test_bollinger_squeeze():
    closes = [100 + (5 if i % 2 else -5) for i in range(100)]      # 高波動
    closes += [100 + (0.3 if i % 2 else -0.3) for i in range(20)]  # 末端低波動 → 擠壓
    bf = bollinger_features(closes, period=20, std_dev=2.0, bw_lookback=120)
    assert bf["available"] is True
    assert bf["squeeze"] is True
    assert 0 <= bf["percent_b"] <= 1


def test_bollinger_insufficient():
    assert bollinger_features([100, 101, 102]) == {"available": False}


# ── detect_classic_patterns ──────────────────────────────────
def test_classic_double_bottom():
    # W 形：低1(100) → 高(115) → 低2(101，相近) → 上
    prices = [120, 116, 112, 108, 104, 100, 104, 108, 112, 115, 112, 108, 104, 101, 104, 108, 112, 116, 120, 124]
    bars = [_bar(p, p + 1, p - 1, p, 1000, f"d{i}") for i, p in enumerate(prices)]
    pats = detect_classic_patterns(bars)
    assert any(p["pattern"] == "double_bottom" and p["kind"] == "bullish" for p in pats)


def test_classic_none_on_trend():
    bars = [_bar(100 + i, 101 + i, 99 + i, 100 + i, 1000, f"d{i}") for i in range(40)]
    assert detect_classic_patterns(bars) == []


# ── atr ──────────────────────────────────────────────────────
def test_atr_basic():
    bars = [_bar(100, 105, 95, 100, 1000, f"d{i}") for i in range(20)]
    assert atr(bars, 14) == 10.0
