"""
Yahoo Finance 數據抓取 Worker
使用 yfinance 套件處理認證、速率限制與重試
"""
import asyncio
import logging
from datetime import date, datetime, timedelta
from functools import partial

import httpx

from app.database import async_session_factory
from app.models.stock import Stock
from app.models.daily_bar import DailyBar, MinuteBar
from app.utils.cache import Cache
from sqlalchemy import select

logger = logging.getLogger(__name__)

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

# yfinance period 對應天數（用於 fetch_historical_kline 選 period）
PERIOD_DAYS = {
    "1y": 365, "2y": 730, "3y": 1095, "5y": 1825, "max": 7300,
}


def _yf_download_sync(symbol: str, period: str, interval: str) -> list[dict]:
    """同步呼叫 yfinance（在 executor 中執行，避免阻塞 event loop）"""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval, auto_adjust=True)
        if df.empty:
            return []

        result = []
        for ts, row in df.iterrows():
            dt = ts.date() if hasattr(ts, "date") else ts
            result.append({
                "date": dt,
                "open": float(row["Open"]) if row["Open"] == row["Open"] else None,
                "high": float(row["High"]) if row["High"] == row["High"] else None,
                "low": float(row["Low"]) if row["Low"] == row["Low"] else None,
                "close": float(row["Close"]) if row["Close"] == row["Close"] else None,
                "adjclose": float(row["Close"]) if row["Close"] == row["Close"] else None,
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
            })
        return result
    except Exception as e:
        logger.error(f"yfinance 抓取失敗 [{symbol}]: {e}")
        return []


def _yf_fast_info_sync(symbol: str) -> dict:
    """同步抓取即時報價"""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        return {
            "regularMarketPrice": getattr(info, "last_price", None),
            "regularMarketChange": getattr(info, "last_price", 0) - getattr(info, "previous_close", 0),
            "regularMarketChangePercent": (
                (getattr(info, "last_price", 0) - getattr(info, "previous_close", 0))
                / getattr(info, "previous_close", 1) * 100
                if getattr(info, "previous_close", 0) else 0
            ),
            "regularMarketVolume": getattr(info, "three_month_average_volume", None),
            "currency": getattr(info, "currency", None),
            "marketState": "REGULAR",
        }
    except Exception as e:
        logger.error(f"yfinance fast_info 失敗 [{symbol}]: {e}")
        return {}


class YahooWorker:
    """Yahoo Finance 數據抓取服務（使用 yfinance）"""

    def __init__(self):
        self.cache = Cache()

    async def _run_sync(self, func, *args):
        """在 thread executor 中執行同步函式"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(func, *args))

    async def fetch_kline_yf(
        self, symbol: str, period: str = "3y", interval: str = "1d"
    ) -> list[dict]:
        """
        用 yfinance 抓取 K 線數據，自動處理認證與速率限制

        Args:
            symbol: Yahoo 股票代碼 (如 2330.TW, ^TWII)
            period: 1mo / 3mo / 6mo / 1y / 2y / 3y / 5y / max
            interval: 1d / 1wk / 1mo
        """
        cache_key = f"yf:kline:{symbol}:{period}:{interval}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        klines = await self._run_sync(_yf_download_sync, symbol, period, interval)

        if klines:
            await self.cache.set(cache_key, klines, expire=3600)

        return klines

    async def fetch_chart_data(
        self, symbol: str, period: str = "3y", interval: str = "1d"
    ) -> dict | None:
        """
        向後相容介面：回傳模擬 Yahoo v8 chart 結構
        讓 stocks.py router 無需改動
        """
        yf_interval = {"1d": "1d", "1wk": "1wk", "1mo": "1mo"}.get(interval, interval)
        klines = await self.fetch_kline_yf(symbol, period, yf_interval)

        if not klines:
            return None

        timestamps = [int(datetime.combine(k["date"], datetime.min.time()).timestamp()) for k in klines]
        opens = [k["open"] for k in klines]
        highs = [k["high"] for k in klines]
        lows = [k["low"] for k in klines]
        closes = [k["close"] for k in klines]
        volumes = [k["volume"] for k in klines]
        adjcloses = [k["adjclose"] for k in klines]

        last_close = closes[-1] if closes else None

        return {
            "chart": {
                "result": [{
                    "meta": {
                        "symbol": symbol,
                        "regularMarketPrice": last_close,
                        "regularMarketChange": (closes[-1] - closes[-2]) if len(closes) >= 2 else 0,
                        "regularMarketChangePercent": (
                            (closes[-1] - closes[-2]) / closes[-2] * 100
                            if len(closes) >= 2 and closes[-2] else 0
                        ),
                        "regularMarketVolume": volumes[-1] if volumes else None,
                        "currency": "TWD",
                        "marketState": "REGULAR",
                    },
                    "timestamp": timestamps,
                    "indicators": {
                        "quote": [{
                            "open": opens,
                            "high": highs,
                            "low": lows,
                            "close": closes,
                            "volume": volumes,
                        }],
                        "adjclose": [{"adjclose": adjcloses}],
                    },
                }],
                "error": None,
            }
        }

    async def fetch_adr_data(self, stock_code: str = None) -> dict | None:
        """抓取 ADR 盤後數據"""
        if stock_code:
            symbols = [ADR_MAPPING.get(stock_code, f"{stock_code}.TW")]
        else:
            symbols = list(ADR_MAPPING.values())

        results = {}
        for symbol in symbols:
            meta = await self._run_sync(_yf_fast_info_sync, symbol)
            if meta.get("regularMarketPrice"):
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
        """抓取大盤指數數據"""
        logger.info("正在抓取大盤指數數據...")
        results = {}
        for name, symbol in INDEX_SYMBOLS.items():
            meta = await self._run_sync(_yf_fast_info_sync, symbol)
            if meta.get("regularMarketPrice"):
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
        self, symbol: str, days: int = 1095
    ) -> list[dict]:
        """抓取歷史 K 線數據並回傳列表"""
        if days <= 365:
            period = "1y"
        elif days <= 730:
            period = "2y"
        elif days <= 1825:
            period = "3y"
        else:
            period = "5y"

        return await self.fetch_kline_yf(symbol, period, "1d")

    async def save_kline_data(self, stock_code: str, klines: list[dict]) -> int:
        """將 K 線數據存入資料庫"""
        saved = 0
        async with async_session_factory() as session:
            result = await session.execute(select(Stock).where(Stock.code == stock_code))
            stock = result.scalar_one_or_none()

            if not stock:
                stock = Stock(code=stock_code, name=f"股票{stock_code}")
                session.add(stock)
                await session.flush()

            for kline in klines:
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
        """將分 K 線數據存入資料庫"""
        saved = 0
        async with async_session_factory() as session:
            result = await session.execute(select(Stock).where(Stock.code == stock_code))
            stock = result.scalar_one_or_none()

            if not stock:
                stock = Stock(code=stock_code, name=f"股票{stock_code}")
                session.add(stock)
                await session.flush()

            for kline in klines:
                bar_time = kline.get("datetime") or kline.get("date")
                if not bar_time:
                    continue

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
        """清理過期的分 K 線數據"""
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

            await session.commit()

        return total_deleted


# 全域實例
yahoo_worker = YahooWorker()


async def fetch_adr_data():
    logger.info("開始執行 Yahoo ADR 數據抓取...")
    results = await yahoo_worker.fetch_adr_data()
    logger.info(f"ADR 數據抓取完成: {len(results)} 筆")


async def fetch_index_data():
    logger.info("開始執行 Yahoo 大盤指數抓取...")
    results = await yahoo_worker.fetch_index_data()
    logger.info(f"大盤指數抓取完成: {len(results)} 筆")


async def fetch_historical_data(stock_code: str, days: int = 1095):
    logger.info(f"手動抓取 {stock_code} 歷史數據 ({days} 天)...")
    symbol = f"{stock_code}.TW"
    klines = await yahoo_worker.fetch_historical_kline(symbol, days)
    if klines:
        saved = await yahoo_worker.save_kline_data(stock_code, klines)
        logger.info(f"{stock_code} 歷史數據抓取完成: {saved} 筆")
    else:
        logger.warning(f"無法取得 {stock_code} 歷史數據")
