"""
T5 交易劇本純函式測試（build_trade_plan）。
"""
from app.services.trade_plan import build_trade_plan
from app.services.risk import position_size

ACCT = {"equity": 1_000_000, "available_cash": 1_000_000, "risk_pct": 2, "max_position_pct": 20}


def test_pullback_long():
    zones = [{"low": 95, "high": 98, "center": 96.5, "kind": "support"},
             {"low": 120, "high": 123, "center": 121.5, "kind": "resistance"}]
    plan = build_trade_plan(current_price=100, atr_14=3, zones=zones,
                            mtf={"verdict": "pullback_in_uptrend", "alignment_score": 80},
                            rs={"rs_rating": {"value": 85}}, divergences=[], volume_ratio=1.0, account=ACCT)
    assert plan["direction"] == "long"
    assert plan["setup_type"] == "順勢拉回"
    assert plan["stop"] < plan["entry_mid"] < plan["target1"]
    assert plan["rr"] is not None and plan["rr"] > 0
    assert plan["suggested_lots"] == position_size(1_000_000, 2, plan["entry_mid"], plan["stop"], 20, 1_000_000)
    assert plan["paper_prefill"]["entry_price"] == plan["entry_mid"]
    assert plan["paper_prefill"]["quantity"] == plan["suggested_lots"]


def test_breakout_setup():
    zones = [{"low": 101, "high": 103, "center": 102, "kind": "resistance"}]
    plan = build_trade_plan(current_price=100, atr_14=2, zones=zones,
                            mtf={"verdict": "aligned_bull", "alignment_score": 85},
                            rs={"rs_rating": {"value": 75}}, divergences=[], volume_ratio=1.5, account=ACCT)
    assert plan["direction"] == "long"
    assert plan["setup_type"] == "突破"


def test_conflict_stand_aside():
    plan = build_trade_plan(current_price=100, atr_14=3, zones=[],
                            mtf={"verdict": "conflict", "alignment_score": 10}, rs={}, divergences=[])
    assert plan["direction"] == "stand_aside"
    assert plan["paper_prefill"] is None
    assert plan["rr"] is None


def test_bear_no_prefill():
    plan = build_trade_plan(current_price=100, atr_14=3, zones=[],
                            mtf={"verdict": "aligned_bear", "alignment_score": 90}, rs={}, divergences=[])
    assert plan["direction"] == "short"
    assert plan["paper_prefill"] is None


def test_stop_structure_when_support_near():
    zones = [{"low": 97, "high": 99, "center": 98, "kind": "support"}]
    plan = build_trade_plan(current_price=100, atr_14=5, zones=zones,
                            mtf={"verdict": "pullback_in_uptrend", "alignment_score": 80},
                            rs={}, divergences=[], account=ACCT)
    # 結構停損(97*0.995=96.5) 比 ATR 停損(98-9=89) 緊 → 取結構
    assert plan["stop_basis"] == "structure"


def test_stop_atr_when_support_far():
    zones = [{"low": 70, "high": 72, "center": 71, "kind": "support"}]
    plan = build_trade_plan(current_price=100, atr_14=2, zones=zones,
                            mtf={"verdict": "aligned_bull", "alignment_score": 90},
                            rs={"rs_rating": {"value": 70}}, divergences=[], volume_ratio=1.0, account=ACCT)
    # 支撐遠在 70，ATR 停損較緊 → 取 ATR
    assert plan["stop_basis"] == "atr"


def test_bearish_divergence_lowers_confidence():
    zones = [{"low": 95, "high": 98, "center": 96.5, "kind": "support"}]
    common = dict(current_price=100, atr_14=3, zones=zones,
                  mtf={"verdict": "aligned_bull", "alignment_score": 80}, rs={"rs_rating": {"value": 60}}, account=ACCT)
    base = build_trade_plan(**common, divergences=[], volume_ratio=1.0)
    bear = build_trade_plan(**common, divergences=[{"kind": "bearish"}], volume_ratio=1.0)
    assert bear["confidence"]["score"] < base["confidence"]["score"]
