"""
相對強弱服務（RS：個股 vs 大盤 ^TWII、vs 類股）

專業選股核心之一：「強勢股」= 比大盤/同業強。提供
- RS 線：個股累積報酬 / 指數累積報酬（rebase 100），上升＝持續領漲。
- RS 評等：全市場百分位 1–99（IBD 式，多窗格加權），快取整個市場分布以攤平成本。
- vs 類股：個股報酬 vs 所屬產業平均。

純函式 `rs_line` 易測；service 負責抓資料 + 對齊日期 + 快取。資料不足回 available:false，不 raise。
"""
import logging
from datetime import date, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def rs_line(stock_closes: list, index_closes: list) -> dict:
    """相對強弱線（rebase 100）。輸入需已依日期對齊、等長。
    rs[i] = (stock[i]/stock[0]) / (index[i]/index[0]) * 100；>100 表跑贏指數。"""
    n = min(len(stock_closes), len(index_closes))
    if n < 2 or not stock_closes[0] or not index_closes[0]:
        return {"available": False}
    s0, i0 = stock_closes[0], index_closes[0]
    rs = []
    for k in range(n):
        if stock_closes[k] and index_closes[k]:
            rs.append(round((stock_closes[k] / s0) / (index_closes[k] / i0) * 100, 2))
    if len(rs) < 2:
        return {"available": False}
    look = min(20, len(rs) - 1)
    slope = 1 if rs[-1] > rs[-1 - look] else (-1 if rs[-1] < rs[-1 - look] else 0)
    stock_ret = (stock_closes[n - 1] / s0 - 1) * 100
    index_ret = (index_closes[n - 1] / i0 - 1) * 100
    return {
        "available": True,
        "rs_line": rs,
        "rs_slope": slope,
        "stock_return_pct": round(stock_ret, 2),
        "index_return_pct": round(index_ret, 2),
        "excess_pct": round(stock_ret - index_ret, 2),
    }


class RelativeStrengthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _index_closes(self, days: int) -> dict:
        """^TWII 每日收盤 {date_iso: close}，Redis 快取 1h。"""
        from app.utils.cache import Cache
        cache = Cache()
        key = f"rs_index:^TWII:{days}"
        cached = await cache.get(key)
        if cached:
            return {d: c for d, c in cached}
        from worker.yahoo_worker import yahoo_worker
        k = await yahoo_worker.fetch_historical_kline("^TWII", days + 15)
        pairs = [(str(x["date"])[:10], float(x["close"])) for x in (k or []) if x.get("close")]
        if pairs:
            await cache.set(key, pairs, expire=3600)
        return {d: c for d, c in pairs}

    async def _stock_closes(self, stock_code: str, days: int) -> dict:
        from app.models.daily_bar import DailyBar
        start = date.today() - timedelta(days=days + 15)
        rows = (await self.db.execute(
            select(DailyBar.trade_date, DailyBar.adjusted_close, DailyBar.close_price)
            .where(DailyBar.stock_code == stock_code, DailyBar.trade_date >= start)
            .order_by(DailyBar.trade_date)
        )).all()
        return {r[0].isoformat(): float(r[1] or r[2]) for r in rows if (r[1] or r[2])}

    async def _market_returns(self, days: int) -> dict:
        """全市場各股近 days 日報酬率 {code: ret_pct}，單一 DISTINCT ON SQL，Redis 快取 6h。"""
        from app.utils.cache import Cache
        cache = Cache()
        key = f"rs_market_ret:{days}"
        cached = await cache.get(key)
        if cached:
            return cached
        start = date.today() - timedelta(days=days + 7)  # 綁 date 物件（asyncpg 需要，不可傳字串）
        sql = text("""
            WITH bars AS (
                SELECT stock_code, trade_date, COALESCE(adjusted_close, close_price) AS px
                FROM daily_bars
                WHERE trade_date >= :start AND COALESCE(adjusted_close, close_price) > 0
            ),
            firsts AS (
                SELECT DISTINCT ON (stock_code) stock_code, px AS first_px
                FROM bars ORDER BY stock_code, trade_date ASC
            ),
            lasts AS (
                SELECT DISTINCT ON (stock_code) stock_code, px AS last_px
                FROM bars ORDER BY stock_code, trade_date DESC
            )
            SELECT f.stock_code, (l.last_px / f.first_px - 1) * 100 AS ret
            FROM firsts f JOIN lasts l ON f.stock_code = l.stock_code
            WHERE f.first_px > 0
        """)
        rows = (await self.db.execute(sql, {"start": start})).all()
        result = {r[0]: round(float(r[1]), 2) for r in rows}
        if result:
            await cache.set(key, result, expire=6 * 3600)
        return result

    async def rs_rating(self, stock_code: str, windows=(90, 180, 365), weights=(0.5, 0.3, 0.2)) -> dict:
        """全市場百分位 1–99（多窗格加權）。"""
        per_window = {}
        partial = False
        for w in windows:
            rets = await self._market_returns(w)
            if stock_code not in rets or len(rets) < 20:
                partial = True
                continue
            vals = list(rets.values())
            mine = rets[stock_code]
            per_window[str(w)] = round(sum(1 for v in vals if v <= mine) / len(vals) * 100, 1)
        if not per_window:
            return {"available": False, "partial": True}
        acc = wsum = 0.0
        for w, weight in zip(windows, weights):
            if str(w) in per_window:
                acc += per_window[str(w)] * weight
                wsum += weight
        value = max(1, min(99, round(acc / wsum))) if wsum else None
        return {"available": value is not None, "value": value, "windows": per_window, "partial": partial}

    async def _vs_sector(self, stock_code: str, window: int = 60) -> dict:
        from app.models.stock import Stock
        from app.services.industry import IndustryService
        stock = (await self.db.execute(select(Stock).where(Stock.code == stock_code))).scalar_one_or_none()
        industry = getattr(stock, "industry_name", None) or getattr(stock, "industry", None) if stock else None
        if not industry:
            return {"available": False}
        sector_returns = await IndustryService(self.db)._industry_returns(window)
        market = await self._market_returns(window)
        sector_ret = sector_returns.get(industry)
        stock_ret = market.get(stock_code)
        if sector_ret is None or stock_ret is None:
            return {"available": False, "industry": industry}
        return {
            "available": True, "industry": industry,
            "stock_return_pct": round(stock_ret, 2), "sector_return_pct": round(sector_ret, 2),
            "diff": round(stock_ret - sector_ret, 2), "outperforming": stock_ret > sector_ret,
        }

    async def analyze(self, stock_code: str, days: int = 365) -> dict:
        stock = await self._stock_closes(stock_code, days)
        if len(stock) < 40:
            return {"stock_code": stock_code, "has_data": False}

        vs_index = {"available": False}
        try:
            idx = await self._index_closes(days)
            common = sorted(set(stock) & set(idx))
            if len(common) >= 40:
                line = rs_line([stock[d] for d in common], [idx[d] for d in common])
                if line.get("available"):
                    line["symbol"] = "^TWII"
                    vs_index = line
        except Exception:
            logger.warning("RS vs index failed for %s", stock_code, exc_info=True)

        rating = await self.rs_rating(stock_code)
        sector = await self._vs_sector(stock_code)
        return {"stock_code": stock_code, "has_data": True,
                "vs_index": vs_index, "rs_rating": rating, "vs_sector": sector}
