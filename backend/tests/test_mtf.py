"""
T2 多週期共振純函式測試（tf_signal / consensus_verdict）。
"""
from app.services.technical import tf_signal, consensus_verdict


def _bull(interval="1d"):
    return {"has_data": True, "interval": interval, "trend": {"direction": "上升"},
            "ma_alignment": "多頭排列", "macd": {"histogram": 0.5}, "rsi": 60,
            "adx": {"adx": 30, "direction": "bullish"}}


def _bear(interval="1d"):
    return {"has_data": True, "interval": interval, "trend": {"direction": "下降"},
            "ma_alignment": "空頭排列", "macd": {"histogram": -0.5}, "rsi": 40,
            "adx": {"adx": 30, "direction": "bearish"}}


def test_tf_signal_bull():
    s = tf_signal(_bull())
    assert s["trend"] == 1 and s["ma"] == 1 and s["macd"] == 1
    assert s["vote"] == 3 and s["dir"] == 1


def test_tf_signal_bear():
    s = tf_signal(_bear())
    assert s["vote"] == -3 and s["dir"] == -1


def test_tf_signal_no_data():
    s = tf_signal({"has_data": False, "interval": "1w"})
    assert s["has_data"] is False and s["dir"] == 0


def test_consensus_aligned_bull():
    b = tf_signal(_bull())
    v = consensus_verdict(b, b, b)
    assert v["verdict"] == "aligned_bull"
    assert v["alignment_score"] == 100


def test_consensus_aligned_bear():
    b = tf_signal(_bear())
    v = consensus_verdict(b, b, b)
    assert v["verdict"] == "aligned_bear"


def test_consensus_pullback_in_uptrend():
    # 日弱、週多、月多
    v = consensus_verdict(tf_signal(_bear()), tf_signal(_bull()), tf_signal(_bull()))
    assert v["verdict"] == "pullback_in_uptrend"


def test_consensus_conflict():
    # 日多、週空、月多 → 月/週衝突
    v = consensus_verdict(tf_signal(_bull()), tf_signal(_bear()), tf_signal(_bull()))
    assert v["verdict"] == "conflict"


def test_consensus_missing_tf_graceful():
    b = tf_signal(_bull())
    nodata = tf_signal({"has_data": False})
    v = consensus_verdict(b, b, nodata)  # 月線缺資料 → dir 0
    assert "narrative" in v and "verdict" in v  # 不崩潰
