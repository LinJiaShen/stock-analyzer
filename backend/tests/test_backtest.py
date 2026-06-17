"""
回測引擎測試：指標 / 績效數學（純函式）+ 端到端 smoke（seed K 線後跑回測）
"""
from datetime import date, timedelta

import pytest

from app.services import backtest as bt


# ---------- 純函式 ----------

def test_sma_basic():
    out = bt._sma([1, 2, 3, 4, 5], 3)
    assert out[:2] == [None, None]
    assert out[2] == 2.0 and out[3] == 3.0 and out[4] == 4.0


def test_rsi_all_gains_high():
    # 連續上漲 → RSI 應接近 100
    out = bt._rsi([float(i) for i in range(1, 30)], 14)
    assert out[-1] is not None and out[-1] > 95


def test_compute_metrics():
    equity_curve = [
        {"date": "2025-01-01", "equity": 1_000_000},
        {"date": "2025-01-02", "equity": 1_100_000},
        {"date": "2025-01-03", "equity": 1_050_000},
    ]
    closed = [
        {"pnl": 100_000, "entry_date": "2025-01-01", "exit_date": "2025-01-02"},
        {"pnl": -50_000, "entry_date": "2025-01-02", "exit_date": "2025-01-03"},
    ]
    m = bt._compute_metrics(1_000_000, equity_curve, closed)
    assert m["total_return_pct"] == 5.0
    assert m["max_drawdown_pct"] == -4.55      # (1.05M-1.1M)/1.1M
    assert m["win_rate"] == 50.0
    assert m["profit_factor"] == 2.0           # 100k / 50k
    assert m["num_trades"] == 2
    assert m["avg_hold_days"] == 1.0
    assert m["sharpe"] is not None


# ---------- 端到端 smoke ----------

@pytest.mark.asyncio
async def test_backtest_run_endpoint(auth_client, db):
    """seed 一檔上漲走勢的 K 線，回測應產生交易並回傳完整指標 + 權益曲線"""
    from app.models.stock import Stock
    from app.models.daily_bar import DailyBar

    db.add(Stock(code="9999", name="回測測試股"))
    base = date(2025, 1, 1)
    for i in range(150):
        # 前 120 天盤整 100，之後 30 天線性上漲到 ~140
        price = 100.0 if i < 120 else 100.0 + (i - 119) * 1.33
        db.add(DailyBar(
            stock_code="9999", trade_date=base + timedelta(days=i),
            open_price=price, high_price=price, low_price=price,
            close_price=price, adjusted_close=price, volume=1_000_000,
        ))
    await db.commit()

    res = await auth_client.post("/api/backtest/run", json={
        "start": base.isoformat(),
        "end": (base + timedelta(days=149)).isoformat(),
        "stock_codes": ["9999"],
        "atr_pct_min": 0, "atr_pct_max": 100,      # 放寬讓上漲走勢能進場
        "rsi_min": 0, "rsi_max": 100,
        "breakout_lookback": 5, "max_position_pct": 100,
        "label": "smoke",
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"]
    assert body["trades"] >= 1                  # 上漲突破應至少成交一筆
    assert len(body["equity_curve"]) > 0
    m = body["metrics"]
    for key in ("total_return_pct", "max_drawdown_pct", "win_rate", "num_trades", "final_equity"):
        assert key in m

    # 列表 + 單筆查詢
    runs = (await auth_client.get("/api/backtest/runs")).json()["runs"]
    assert len(runs) == 1 and runs[0]["label"] == "smoke"
    detail = (await auth_client.get(f"/api/backtest/runs/{body['id']}")).json()
    assert len(detail["equity_curve"]) > 0
