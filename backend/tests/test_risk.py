"""
風控模組（position_size / 風控閘門）純函式測試
"""
from datetime import date, datetime
from types import SimpleNamespace as NS

from app.services import risk


# ---------- position_size ----------

def test_position_size_risk_binds():
    # 停損寬（每張風險 20,000），風險預算 20,000 → 只能 1 張
    assert risk.position_size(1_000_000, 2, 100, 80, 20, 1_000_000) == 1


def test_position_size_position_cap_binds():
    # 風險允許 100 張，但單一持股上限 20% → 200,000 / 100,000 = 2 張
    assert risk.position_size(1_000_000, 10, 100, 99, 20, 1_000_000) == 2


def test_position_size_cash_binds():
    # 可用現金 300,000 / 每張 100,000 = 3 張（風險與持股上限都更寬）
    assert risk.position_size(1_000_000, 50, 100, 90, 100, 300_000) == 3


def test_position_size_invalid_stop_returns_zero():
    assert risk.position_size(1_000_000, 2, 100, 100, 20, 1_000_000) == 0
    assert risk.position_size(1_000_000, 2, 100, 110, 20, 1_000_000) == 0


def test_position_size_too_small_for_one_lot():
    # 本金 10 萬、風險 2%（預算 2,000）、每張風險 20,000 → 連 1 張都買不起 → 0
    assert risk.position_size(100_000, 2, 600, 580, 100, 1_000_000) == 0


# ---------- todays_realized_pnl ----------

def test_todays_realized_pnl_only_counts_today():
    trade = NS(
        entry_price=100,
        exits=[
            {"filled_time": "2026-06-16T09:00:00", "filled_price": 110, "quantity": 1},
            {"filled_time": "2026-06-15T09:00:00", "filled_price": 90, "quantity": 1},
            {"filled_time": None, "price": 120, "quantity": 1},
        ],
    )
    # 只有 110 那筆算今天：net_realized_pnl(100,110,1) = 9372
    assert risk.todays_realized_pnl([trade], date(2026, 6, 16)) == 9372


# ---------- consecutive_losses ----------

def test_consecutive_losses_counts_leading_negatives():
    closed = [NS(realized_pnl=v) for v in (-100, -50, 200, -10)]
    assert risk.consecutive_losses(closed) == 2


# ---------- evaluate_auto_gates ----------

def _account(**kw):
    base = dict(
        initial_capital=1_000_000, max_positions=5,
        daily_loss_limit_pct=3, max_consecutive_losses=5, fee_discount=1.0,
    )
    base.update(kw)
    return NS(**base)


def test_gates_allow_when_clean():
    res = risk.evaluate_auto_gates(_account(), [], date(2026, 6, 16))
    assert res["allowed"] is True
    assert res["open_count"] == 0


def test_gates_block_when_positions_full():
    trades = [NS(status="open", exits=[], entry_price=100, realized_pnl=0, closed_at=None) for _ in range(5)]
    res = risk.evaluate_auto_gates(_account(), trades, date(2026, 6, 16))
    assert res["allowed"] is False
    assert any("持倉已滿" in r for r in res["reasons"])


def test_gates_block_on_daily_loss_breach():
    # 今天平倉大虧（毛損 40 萬 >> 3% × 100 萬 = 3 萬）
    t = NS(
        status="closed", entry_price=100, realized_pnl=-400000,
        closed_at=datetime(2026, 6, 16, 10, 0),
        exits=[{"filled_time": "2026-06-16T10:00:00", "filled_price": 60, "quantity": 10}],
    )
    res = risk.evaluate_auto_gates(_account(), [t], date(2026, 6, 16))
    assert res["allowed"] is False
    assert any("熔斷" in r for r in res["reasons"])


def test_gates_block_on_consecutive_losses():
    # 5 筆連敗，出場日為舊日期（不觸發今日熔斷），僅觸發連敗暫停
    trades = [
        NS(
            status="closed", entry_price=100, realized_pnl=-1000,
            closed_at=datetime(2026, 6, 10 + i, 13, 0),
            exits=[{"filled_time": "2020-01-01T00:00:00", "filled_price": 90, "quantity": 1}],
        )
        for i in range(5)
    ]
    res = risk.evaluate_auto_gates(_account(), trades, date(2026, 6, 16))
    assert res["allowed"] is False
    assert any("連續虧損" in r for r in res["reasons"])
