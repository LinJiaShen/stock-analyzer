"""
T3 相對強弱純函式測試（rs_line）。RS 評等 / vs 類股需 DB，線上驗證。
"""
from app.services.relative_strength import rs_line


def test_rs_line_outperform():
    stock = [100, 110, 120, 130, 140, 150]   # 個股漲 50%
    index = [1000] * 6                        # 大盤持平
    r = rs_line(stock, index)
    assert r["available"] is True
    assert r["rs_line"][-1] > 100
    assert r["rs_slope"] == 1
    assert r["excess_pct"] > 0


def test_rs_line_underperform():
    stock = [100] * 6                          # 個股持平
    index = [1000, 1050, 1100, 1150, 1200, 1250]  # 大盤漲
    r = rs_line(stock, index)
    assert r["rs_line"][-1] < 100
    assert r["rs_slope"] == -1
    assert r["excess_pct"] < 0


def test_rs_line_equal():
    stock = [100, 110, 121]
    index = [100, 110, 121]  # 同步同幅 → RS 恆為 100
    r = rs_line(stock, index)
    assert all(abs(x - 100) < 0.01 for x in r["rs_line"])


def test_rs_line_insufficient():
    assert rs_line([100], [100]) == {"available": False}
    assert rs_line([0, 1], [1, 1]) == {"available": False}
