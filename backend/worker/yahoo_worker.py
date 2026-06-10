"""
Yahoo Finance 數據抓取 Worker
- ADR 盤後價格
- 大盤指數 (TAIEX, S&P 500, NASDAQ)
- 歷史 K 線數據
"""
import asyncio
import logging
from datetime import date, datetime, timedelta

import httpx

from app.config import settings
from app.database import async_session_factory
from app.models.stock import Stock
from app.models.daily_bar import DailyBar, MinuteBar
from app.utils.cache import Cache
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Yahoo Finance API
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart"

# 追蹤的 ADR 對應關係 (台灣股票 -> Yahoo 代碼)
ADR_MAPPING = {
    "2330": "2330.TW",
    "2454": "2454.TW",
    "2317": "2317.TW",
}

# 大盤指數
INDEX_SYMBOLS = {
    "TAIEX": "^TWII",
    "SP500": "^GSPC",
    "NASDAQ": "^IXIC",
}


class YahooWorker:
    """Yahoo Finance 數據抓取服務"""

    def __init__(self):
        self.cache = Cache()
        self._session: httpx.AsyncClient | None = None

    async def _get_session(self) -> httpx.AsyncClient:
        if self._session is None or self._session.is_closed:
            self._session = httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
            )
        return self._session

    async def fetch_chart_data(
        self, symbol: str, period: str = "1d", interval: str = "1d"
    ) -> dict | None:
        """
        抓取 K 線圖表數據

        Args:
            symbol: 股票/指數代碼
            period: 週期 (1d, 5d, 1mo, 3mo, 6mo, 1y, 5y, max)
            interval: 間隔 (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)

        Returns:
            圖表數據字典
        """
        cache_key = f"yahoo:chart:{symbol}:{period}:{interval}"

        # 檢查快取
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        client = await self._get_session()
        params = {
            "symbol": symbol,
            "period1": int((datetime.now() - timedelta(days=365)).timestamp()),
            "period2": int(datetime.now().timestamp()),
            "interval": interval,
        }

        try:
            response = await client.get(YAHOO_CHART_URL, params=params)
            if response.status_code == 429:
                logger.warning(f"Yahoo Finance 速率限制 [{symbol}]，等待 5 秒後重試...")
                await asyncio.sleep(5)
                response = await client.get(YAHOO_CHART_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 快取 1 小時
            await self.cache.set(cache_key, data, expire=3600)
            return data
        except httpx.HTTPError as e:
            logger.error(f"Yahoo Finance HTTP 錯誤 [{symbol}]: {e}")
            return None
        except Exception as e:
            logger.error(f"Yahoo Finance 請求失敗 [{symbol}]: {e}")
            return None

    async def fetch_adr_data(self, stock_code: str = None) -> dict | None:
        """
        抓取 ADR 盤後數據

        Args:
            stock_code: 股票代碼 (預設抓取所有追蹤的 ADR)

        Returns:
            ADR 數據
        """
        if stock_code:
            symbols = [ADR_MAPPING.get(stock_code, f"{stock_code}.TW")]
        else:
            symbols = list(ADR_MAPPING.values())

        results = {}
        for symbol in symbols:
            data = await self.fetch_chart_data(symbol)
            if data and "chart" in data and data["chart"]["result"]:
                result = data["chart"]["result"][0]
                meta = result.get("meta", {})
                results[symbol] = {
                    "symbol": symbol,
                    "regular_market_price": meta.get("regularMarketPrice"),
                    "regular_market_change": meta.get("regularMarketChange"),
                    "regular_market_change_percent": meta.get("regularMarketChangePercent"),
                    "regular_market_volume": meta.get("regularMarketVolume"),
                    "currency": meta.get("currency"),
                    "market_state": meta.get("marketState"),
                }

        return results

    async def fetch_index_data(self) -> dict:
        """
        抓取大盤指數數據

        Returns:
            指數數據字典
        """
        logger.info("正在抓取大盤指數數據...")

        results = {}
        for name, symbol in INDEX_SYMBOLS.items():
            data = await self.fetch_chart_data(symbol)
            if data and "chart" in data and data["chart"]["result"]:
                result = data["chart"]["result"][0]
                meta = result.get("meta", {})
                results[name] = {
                    "symbol": symbol,
                    "name": name,
                    "price": meta.get("regularMarketPrice"),
                    "change": meta.get("regularMarketChange"),
                    "change_percent": meta.get("regularMarketChangePercent"),
                    "volume": meta.get("regularMarketVolume"),
                    "market_state": meta.get("marketState"),
                }
                logger.info(f"  {name}: {meta.get('regularMarketPrice')}")
            else:
                logger.warning(f"  無法取得 {name} 數據")

        return results

    async def fetch_historical_kline(
        self, symbol: str, days: int = 365
    ) -> list[dict]:
        """
        抓取歷史 K 線數據

        Args:
            symbol: 股票代碼
            days: 天數 (預設 365 天)

        Returns:
            K 線數據列表
        """
        data = await self.fetch_chart_data(symbol)
        if not data or "chart" not in data or not data["chart"]["result"]:
            return []

        result = data["chart"]["result"][0]
        timestamps = result.get("timestamp", [])
        indicators = result.get("indicators", {})
        quote = indicators.get("quote", [])

        if not timestamps or not quote:
            return []

        klines = []
        for i, timestamp in enumerate(timestamps):
            if i >= len(quote[0]["open"]):
                break

            dt = datetime.fromtimestamp(timestamp).date()
            klines.append({
                "date": dt,
                "open": quote[0]["open"][i],
                "high": quote[0]["high"][i],
                "low": quote[0]["low"][i],
                "close": quote[0]["close"][i],
                "adjclose": quote[0]["adjclose"][i],
                "volume": quote[0]["volume"][i],
            })

        return klines[-days:]

    async def save_kline_data(
        self, stock_code: str, klines: list[dict]
    ) -> int:
        """
        將 K 線數據存入資料庫

        Args:
            stock_code: 股票代碼
            klines: K 線數據列表

        Returns:
            成功儲存的筆數
        """
        saved = 0
        async with async_session_factory() as session:
            # 確保股票記錄存在
            result = await session.execute(
                select(Stock).where(Stock.code == stock_code)
            )
            stock = result.scalar_one_or_none()

            if not stock:
                stock = Stock(
                    code=stock_code,
                    name=f"股票{stock_code}",
                )
                session.add(stock)
                await session.flush()

            for kline in klines:
                # 檢查是否已存在
                existing = await session.execute(
                    select(DailyBar).where(
                        DailyBar.stock_code == stock_code,
                        DailyBar.trade_date == kline["date"],
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                bar = DailyBar(
                    stock_code=stock_code,
                    trade_date=kline["date"],
                    open_price=kline.get("open"),
                    high_price=kline.get("high"),
                    low_price=kline.get("low"),
                    close_price=kline.get("close"),
                    adjusted_close=kline.get("adjclose"),
                    volume=kline.get("volume", 0),
                )
                session.add(bar)
                saved += 1

            await session.commit()
            logger.info(f"儲存 {stock_code} K 線數據: {saved} 筆")
            return saved


    async def save_minute_kline_data(
        self, stock_code: str, interval_minutes: int, klines: list[dict]
    ) -> int:
        """
        將分 K 線數據存入資料庫

        Args:
            stock_code: 股票代碼
            interval_minutes: 分K間隔 (1, 3, 5, 15, 30, 60)
            klines: 分K數據列表，每個 dict 包含 datetime, open, high, low, close, volume

        Returns:
            成功儲存的筆數
        """
        saved = 0
        async with async_session_factory() as session:
            # 確保股票記錄存在
            result = await session.execute(
                select(Stock).where(Stock.code == stock_code)
            )
            stock = result.scalar_one_or_none()

            if not stock:
                stock = Stock(
                    code=stock_code,
                    name=f"股票{stock_code}",
                )
                session.add(stock)
                await session.flush()

            for kline in klines:
                bar_time = kline.get("datetime") or kline.get("date")
                if not bar_time:
                    continue

                # 檢查是否已存在
                existing = await session.execute(
                    select(MinuteBar).where(
                        MinuteBar.stock_code == stock_code,
                        MinuteBar.bar_time == bar_time,
                        MinuteBar.interval_minutes == interval_minutes,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                bar = MinuteBar(
                    stock_code=stock_code,
                    bar_time=bar_time,
                    interval_minutes=interval_minutes,
                    open_price=kline.get("open"),
                    high_price=kline.get("high"),
                    low_price=kline.get("low"),
                    close_price=kline.get("close"),
                    volume=kline.get("volume", 0),
                )
                session.add(bar)
                saved += 1

            await session.commit()
            logger.info(f"儲存 {stock_code} 分K數據 ({interval_minutes}min): {saved} 筆")
            return saved

    async def cleanup_expired_minute_bars(self, max_days: dict[int, int] = None) -> int:
        """
        清理過期的分 K 線數據

        Args:
            max_days: 分K間隔對應的最大保留天數 {interval_minutes: days}
                      預設: {1: 7, 3: 7, 5: 14, 15: 14, 30: 30, 60: 30}

        Returns:
            刪除的筆數
        """
        if max_days is None:
            max_days = {1: 7, 3: 7, 5: 14, 15: 14, 30: 30, 60: 30}

        from sqlalchemy import delete

        total_deleted = 0
        async with async_session_factory() as session:
            for interval_minutes, days in max_days.items():
                cutoff = datetime.now() - timedelta(days=days)
                result = await session.execute(
                    delete(MinuteBar).where(
                        MinuteBar.interval_minutes == interval_minutes,
                        MinuteBar.bar_time < cutoff,
                    )
                )
                total_deleted += result.rowcount
                logger.info(f"清理 {interval_minutes}min 分K: 刪除 {result.rowcount} 筆 (> {days}天)")

            await session.commit()

        if total_deleted > 0:
            logger.info(f"分K數據清理完成: 共刪除 {total_deleted} 筆")
        return total_deleted


# 全域實例
yahoo_worker = YahooWorker()


async def fetch_adr_data():
    """定時任務: 抓取 ADR 數據"""
    logger.info("開始執行 Yahoo ADR 數據抓取...")
    results = await yahoo_worker.fetch_adr_data()
    if results:
        logger.info(f"ADR 數據抓取完成: {len(results)} 筆")
    else:
        logger.warning("沒有取得 ADR 數據")


async def fetch_index_data():
    """定時任務: 抓取大盤指數數據"""
    logger.info("開始執行 Yahoo 大盤指數抓取...")
    results = await yahoo_worker.fetch_index_data()
    logger.info(f"大盤指數抓取完成: {len(results)} 筆")


async def fetch_historical_data(stock_code: str, days: int = 365):
    """
    手動觸發歷史數據抓取
    """
    logger.info(f"手動抓取 {stock_code} 歷史數據 ({days} 天)...")
    symbol = f"{stock_code}.TW"
    klines = await yahoo_worker.fetch_historical_kline(symbol, days)
    if klines:
        saved = await yahoo_worker.save_kline_data(stock_code, klines)
        logger.info(f"{stock_code} 歷史數據抓取完成: {saved} 筆")
    else:
        logger.warning(f"無法取得 {stock_code} 歷史數據")
