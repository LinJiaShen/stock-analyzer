"""
TDCC 集保大戶持股：端點趨勢 + 籌碼集中度改用真資料
"""
from datetime import date

import pytest


@pytest.mark.asyncio
async def test_tdcc_endpoint_trend_and_change(client, db):
    from app.models.stock import Stock
    from app.models.daily_bar import TDCCHolderData

    db.add(Stock(code="2330", name="台積電"))
    db.add(TDCCHolderData(stock_code="2330", week_date=date(2026, 6, 5),
                          holder_400_ratio=0.86, holder_1000_ratio=0.84,
                          holder_1000_count=1470, float_shares=25900000000))
    db.add(TDCCHolderData(stock_code="2330", week_date=date(2026, 6, 12),
                          holder_400_ratio=0.8789, holder_1000_ratio=0.8518,
                          holder_1000_count=1482, float_shares=25932370067))
    await db.commit()

    res = await client.get("/api/stocks/2330/tdcc?weeks=8")
    assert res.status_code == 200
    body = res.json()
    assert len(body["series"]) == 2
    assert body["latest"]["big_1000_ratio"] == 85.18
    assert body["latest"]["big_400_ratio"] == 87.89
    assert body["weekly_change"] == 1.18   # 85.18 − 84.0


@pytest.mark.asyncio
async def test_concentration_uses_tdcc(db):
    from app.models.stock import Stock
    from app.models.daily_bar import TDCCHolderData
    from app.services.chip import ChipService

    db.add(Stock(code="2454", name="聯發科"))
    db.add(TDCCHolderData(stock_code="2454", week_date=date(2026, 6, 5), holder_1000_ratio=0.60, holder_1000_count=500))
    db.add(TDCCHolderData(stock_code="2454", week_date=date(2026, 6, 12), holder_1000_ratio=0.62, holder_1000_count=510))
    await db.commit()

    conc = await ChipService(db).analyze_concentration("2454")
    assert conc["source"] == "tdcc"
    assert conc["big_holder_ratio"] == 62.0
    assert conc["big_holder_change"] == 2.0          # +2 個百分點
    assert conc["large_holder_trend"] == "accumulating"
    assert conc["signal"] == "bullish"


@pytest.mark.asyncio
async def test_concentration_falls_back_without_tdcc(db):
    """無 TDCC 資料時不杜撰集中度（concentration_ratio=None），signal 仍可由代理推得"""
    from app.services.chip import ChipService
    conc = await ChipService(db).analyze_concentration("9999")
    assert conc["concentration_ratio"] is None
    assert conc["source"] in ("none", "proxy")
