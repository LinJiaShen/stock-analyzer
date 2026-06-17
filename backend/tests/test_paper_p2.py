"""
P2 測試：決策日誌、日權益快照/Sortino、站內通知
"""
from datetime import date, timedelta

import pytest

from app.routers.paper_trades import _daily_risk_metrics


# ---------- 日報酬風險指標（純函式） ----------

def test_daily_risk_metrics_up_only():
    s = [{"date": f"d{i}", "equity": e} for i, e in enumerate([100, 110, 120, 130])]
    m = _daily_risk_metrics(s)
    assert m["sharpe"] is not None
    assert m["sortino"] is None          # 全程上漲、無下檔報酬
    assert m["max_drawdown_pct"] == 0.0


def test_daily_risk_metrics_with_drawdown():
    s = [{"date": f"d{i}", "equity": e} for i, e in enumerate([100, 110, 99, 108])]
    m = _daily_risk_metrics(s)
    assert m["sharpe"] is not None and m["sortino"] is not None
    assert m["max_drawdown_pct"] < 0


def test_daily_risk_metrics_insufficient():
    s = [{"date": "d0", "equity": 100}, {"date": "d1", "equity": 110}]
    assert _daily_risk_metrics(s)["sharpe"] is None


# ---------- 整合 ----------

@pytest.mark.asyncio
async def test_stats_sortino_from_snapshots(auth_client, db):
    from sqlalchemy import select
    from app.models.user import User as UM
    from app.models.paper_equity_snapshot import PaperEquitySnapshot

    user = (await db.execute(select(UM).where(UM.username == "testuser"))).scalar_one()
    base = date(2026, 1, 1)
    for i, e in enumerate([1_000_000, 1_010_000, 990_000, 1_020_000, 1_015_000]):
        db.add(PaperEquitySnapshot(user_id=user.id, snapshot_date=base + timedelta(days=i), equity=e))
    await db.commit()

    stats = (await auth_client.get("/api/paper-trades/stats")).json()
    assert stats["sharpe"] is not None
    assert stats["sortino"] is not None
    assert stats["max_drawdown_pct"] is not None
    assert len(stats["equity_curve"]) == 5


@pytest.mark.asyncio
async def test_decision_snapshot_in_list(auth_client, db):
    from sqlalchemy import select
    from app.models.user import User as UM
    from app.models.paper_trade import PaperTrade

    user = (await db.execute(select(UM).where(UM.username == "testuser"))).scalar_one()
    db.add(PaperTrade(
        user_id=user.id, stock_code="2330", entry_price=100, quantity=1,
        remaining_quantity=1, status="open",
        exits=[{"type": "sl", "seq": 1, "price": 90, "quantity": 1}],
        decision_snapshot={"total": 61.5, "technical": 70, "rr_ratio": 2.1},
    ))
    await db.commit()

    trades = (await auth_client.get("/api/paper-trades/")).json()["trades"]
    snap = trades[0]["decision_snapshot"]
    assert snap and snap["total"] == 61.5 and snap["rr_ratio"] == 2.1


@pytest.mark.asyncio
async def test_notifications_flow(auth_client, db):
    from sqlalchemy import select
    from app.models.user import User as UM
    from app.models.notification import Notification

    user = (await db.execute(select(UM).where(UM.username == "testuser"))).scalar_one()
    db.add(Notification(user_id=user.id, type="open", message="AI 自動開倉 2 筆"))
    db.add(Notification(user_id=user.id, type="fill", message="TP 成交 2330"))
    await db.commit()

    res = (await auth_client.get("/api/notifications/")).json()
    assert res["unread"] == 2
    assert len(res["notifications"]) == 2

    await auth_client.post("/api/notifications/read")
    res2 = (await auth_client.get("/api/notifications/")).json()
    assert res2["unread"] == 0
