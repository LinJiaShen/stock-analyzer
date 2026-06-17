"""
月營收：端點趨勢 + radar 成長分數改用真實 YoY
"""
from datetime import date

import pytest


@pytest.mark.asyncio
async def test_revenue_endpoint(client, db):
    from app.models.stock import Stock
    from app.models.monthly_revenue import StockMonthlyRevenue

    db.add(Stock(code="2330", name="台積電"))
    db.add(StockMonthlyRevenue(stock_code="2330", revenue_month=date(2026, 4, 1),
                               revenue=410725118, yoy_pct=28.0, mom_pct=2.0, cum_yoy_pct=29.5))
    db.add(StockMonthlyRevenue(stock_code="2330", revenue_month=date(2026, 5, 1),
                               revenue=416975163, yoy_pct=30.09, mom_pct=1.52, cum_yoy_pct=29.98))
    await db.commit()

    res = await client.get("/api/stocks/2330/revenue?months=12")
    assert res.status_code == 200
    body = res.json()
    assert len(body["series"]) == 2
    assert body["series"][0]["month"] == "2026-04"   # 舊→新
    assert body["latest"]["month"] == "2026-05"
    assert body["latest"]["yoy_pct"] == 30.09


@pytest.mark.asyncio
async def test_radar_growth_uses_revenue_yoy(db):
    from app.models.stock import Stock
    from app.models.monthly_revenue import StockMonthlyRevenue
    from app.services.scoring import ScoringService

    db.add(Stock(code="2330", name="台積電"))
    db.add(StockMonthlyRevenue(stock_code="2330", revenue_month=date(2026, 5, 1),
                               revenue=416975163, yoy_pct=30.09))
    await db.commit()

    radar = await ScoringService(db).calculate_radar_data("2330")
    assert radar["radar"]["growth"] == 90   # YoY 30.09 ≥ 30
