"""
VWAP / OBV / ADX 純函式測試
"""
import pytest

from app.services.technical import TechnicalService


def _bars(prices, vols=None):
    vols = vols or [1000] * len(prices)
    return [{"open": p, "high": p + 1, "low": p - 1, "close": p, "volume": v} for p, v in zip(prices, vols)]


def test_obv():
    svc = TechnicalService(None)
    obv = svc._calculate_obv(_bars([10, 11, 10, 12]))
    assert obv == [0, 1000, 0, 1000]


def test_obv_divergence_bullish():
    svc = TechnicalService(None)
    closes = list(range(100, 80, -1))   # 價跌
    obv = list(range(0, 2000, 100))     # OBV 漲
    assert svc._obv_divergence(closes, obv, 20) == "bullish"


def test_vwap_flat():
    svc = TechnicalService(None)
    vwap = svc._calculate_vwap(_bars([10] * 25), 20)
    assert vwap[-1] == pytest.approx(10.0)


def test_adx_uptrend():
    svc = TechnicalService(None)
    adx = svc._calculate_adx(_bars([100 + i for i in range(40)]), 14)
    assert adx["adx"] is not None
    assert adx["plus_di"] > adx["minus_di"]   # 上升趨勢 +DI 強於 -DI


def test_adx_insufficient_data():
    svc = TechnicalService(None)
    assert svc._calculate_adx(_bars([100, 101, 102]), 14)["adx"] is None
