"""
大盤位階：三大法人現貨總量 + 漲跌家數彙總
"""
from datetime import date

import pytest


@pytest.mark.asyncio
async def test_market_overview(client, db):
    from app.models.stock import Stock
    from app.models.daily_bar import DailyBar, ChipData

    d1, d2 = date(2026, 6, 11), date(2026, 6, 12)
    db.add(Stock(code="T1", name="測試一"))
    db.add(Stock(code="T2", name="測試二"))
    # T1 上漲、T2 下跌
    db.add(DailyBar(stock_code="T1", trade_date=d1, close_price=100, adjusted_close=100, volume=1000))
    db.add(DailyBar(stock_code="T1", trade_date=d2, close_price=110, adjusted_close=110, volume=1000))
    db.add(DailyBar(stock_code="T2", trade_date=d1, close_price=50, adjusted_close=50, volume=1000))
    db.add(DailyBar(stock_code="T2", trade_date=d2, close_price=45, adjusted_close=45, volume=1000))
    db.add(ChipData(stock_code="T1", trade_date=d2, foreign_net=5000, trust_net=2000, proprietary_net=-1000))
    db.add(ChipData(stock_code="T2", trade_date=d2, foreign_net=-3000, trust_net=500, proprietary_net=200))
    await db.commit()

    res = await client.get("/api/market/overview?nocache=1")
    assert res.status_code == 200
    body = res.json()

    inst = body["institutional"]
    assert inst["foreign_net"] == 2000      # 5000 − 3000
    assert inst["trust_net"] == 2500        # 2000 + 500
    assert inst["total"] == 3700            # 2000 + 2500 − 800

    assert body["breadth"]["up"] == 1
    assert body["breadth"]["down"] == 1
    assert "index" in body and "hot_industries" in body
