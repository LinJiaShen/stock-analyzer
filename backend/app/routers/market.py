"""
大盤位階路由（由上而下市場視圖）

- GET /api/market/overview  加權指數位階(vs 均線) + 三大法人現貨總買賣超 + 漲跌家數 + 產業輪動
資料來源：^TWII(yfinance,算均線位階)、chip_data(三大法人)、daily_bars(寬度)、stocks(產業)。
結果快取 10 分鐘（?nocache=1 可略過，供測試/手動刷新）。
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.daily_bar import ChipData, DailyBar

router = APIRouter(prefix="/api/market", tags=["大盤"])


def _ma(closes: list, n: int):
    return round(sum(closes[-n:]) / n, 2) if len(closes) >= n else None


@router.get("/overview")
async def market_overview(
    nocache: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    from app.utils.cache import Cache
    cache = Cache()
    if not nocache:
        cached = await cache.get("market_overview")
        if cached is not None:
            return cached

    result: dict = {}

    # 1) 加權指數 + 均線位階
    index = None
    try:
        from worker.yahoo_worker import yahoo_worker
        k = await yahoo_worker.fetch_historical_kline("^TWII", 200)
        closes = [float(x["close"]) for x in (k or []) if x.get("close")]
        if len(closes) >= 60:
            last, prev = closes[-1], closes[-2]
            ma20, ma60, ma120 = _ma(closes, 20), _ma(closes, 60), _ma(closes, 120)
            above = sum(1 for m in (ma20, ma60, ma120) if m and last >= m)
            stage = ["低檔（空頭排列）", "偏空", "偏多", "高檔（多頭排列）"][above]

            def pos(m):
                return None if m is None else ("above" if last >= m else "below")

            index = {
                "value": round(last, 2),
                "change_pct": round((last - prev) / prev * 100, 2) if prev else None,
                "ma20": ma20, "ma60": ma60, "ma120": ma120,
                "vs_ma20": pos(ma20), "vs_ma60": pos(ma60), "vs_ma120": pos(ma120),
                "above_count": above, "stage": stage,
            }
    except Exception:
        index = None
    result["index"] = index

    # 2) 三大法人現貨總買賣超（最新 chip 日，張）
    latest_chip = (await db.execute(select(func.max(ChipData.trade_date)))).scalar()
    institutional = None
    if latest_chip:
        row = (await db.execute(
            select(
                func.sum(ChipData.foreign_net),
                func.sum(ChipData.trust_net),
                func.sum(ChipData.proprietary_net),
            ).where(ChipData.trade_date == latest_chip)
        )).one()
        f, t, p = (float(x or 0) for x in row)
        institutional = {
            "date": latest_chip.isoformat(),
            "foreign_net": round(f), "trust_net": round(t),
            "proprietary_net": round(p), "total": round(f + t + p),
        }
    result["institutional"] = institutional

    # 3) 市場寬度（最新交易日 vs 前一日 漲跌家數）
    dates = (await db.execute(
        select(DailyBar.trade_date).distinct().order_by(DailyBar.trade_date.desc()).limit(2)
    )).scalars().all()
    breadth = None
    if len(dates) == 2:
        cur_d, prev_d = dates[0], dates[1]
        sql = text("""
            SELECT
                count(*) FILTER (WHERE c.close_price > p.close_price) AS up,
                count(*) FILTER (WHERE c.close_price < p.close_price) AS down,
                count(*) FILTER (WHERE c.close_price = p.close_price) AS flat
            FROM daily_bars c
            JOIN daily_bars p ON c.stock_code = p.stock_code
            WHERE c.trade_date = :cur AND p.trade_date = :prev
        """)
        r = (await db.execute(sql, {"cur": cur_d, "prev": prev_d})).one()
        breadth = {"date": cur_d.isoformat(), "up": int(r.up), "down": int(r.down), "flat": int(r.flat)}
    result["breadth"] = breadth

    # 4) 產業輪動（複用 IndustryService 的市場寬度計算）
    from app.services.industry import IndustryService
    ind = await IndustryService(db)._industry_returns(30)
    ranked = sorted(ind.items(), key=lambda kv: kv[1], reverse=True)
    result["hot_industries"] = [{"industry": k, "return": v} for k, v in ranked[:5]]
    result["cold_industries"] = [{"industry": k, "return": v} for k, v in ranked[-5:][::-1]] if len(ranked) >= 5 else []
    result["market_avg_return"] = round(sum(ind.values()) / len(ind), 2) if ind else None

    if not nocache:
        await cache.set("market_overview", result, expire=600)
    return result
