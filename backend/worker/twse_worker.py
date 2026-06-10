"""
TWSE 數據抓取 Worker
- 速率限制防護 (Redis)
- 指數退避重試
- 非同步批次處理
"""
import asyncio
import logging
import random
from datetime import date, datetime

import httpx

from app.config import settings
from app.database import async_session_factory
from app.models.stock import Stock
from app.models.daily_bar import DailyBar
from app.utils.cache import Cache
from sqlalchemy import select

logger = logging.getLogger(__name__)

# TWSE API 端點
TWSE_DAILY_URL = "https://www.twse.com.tw/rwd/zh/trading/exchange/sw/oi-t1"


class TWSEWorker:
    """TWSE 數據抓取服務"""

    def __init__(self):
        self.cache = Cache()
        self.rate_limit_delay = settings.TWSE_RATE_LIMIT_DELAY

    async def _request_with_retry(
        self, url: str, params: dict | None = None, max_retries: int = 3
    ) -> dict | None:
        """
        帶速率限制與重試的 HTTP 請求

        Args:
            url: 請求 URL
            params: 查詢參數
            max_retries: 最大重試次數

        Returns:
            回應 JSON 資料，失敗時回傳 None
        """
        for attempt in range(max_retries):
            # 檢查速率限制
            allowed = await self.cache.set_rate_limit("twse:rate", expire=60)
            if not allowed:
                wait_time = random.uniform(2.0, 5.0)
                logger.warning(f"TWSE 速率限制，等待 {wait_time:.1f} 秒...")
                await asyncio.sleep(wait_time)
                continue

            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    wait_time = min(self.rate_limit_delay * (2 ** attempt), 30)
                    wait_time += random.uniform(0, 1)
                    logger.warning(
                        f"TWSE 429 速率限制，等待 {wait_time:.1f} 秒 (嘗試 {attempt + 1}/{max_retries})"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"TWSE HTTP 錯誤: {e}")
                    return None
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                wait_time = min(self.rate_limit_delay * (2 ** attempt), 30)
                logger.warning(
                    f"TWSE 連線錯誤: {e}，等待 {wait_time:.1f} 秒 (嘗試 {attempt + 1}/{max_retries})"
                )
                await asyncio.sleep(wait_time)
            except Exception as e:
                logger.error(f"TWSE 請求失敗: {e}")
                return None

        logger.error(f"TWSE 請求失敗，已重試 {max_retries} 次")
        return None

    async def fetch_daily_data(self, stock_code: str, target_date: date = None) -> dict | None:
        """
        抓取單檔股票日 K 線數據

        Args:
            stock_code: 股票代碼
            target_date: 目標日期 (預設今天)

        Returns:
            K 線數據字典
        """
        if target_date is None:
            target_date = date.today()

        date_str = target_date.strftime("%Y%m%d")
        cache_key = f"twse:daily:{stock_code}:{date_str}"

        # 檢查快取
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        params = {
            "response": "json",
            "date": date_str,
            "stockNo": stock_code,
        }

        data = await self._request_with_retry(TWSE_DAILY_URL, params)
        if data:
            await self.cache.set(cache_key, data, expire=86400)
            return data

        return None

    async def save_daily_bar(self, stock_code: str, data: dict) -> bool:
        """
        將 K 線數據存入資料庫

        Args:
            stock_code: 股票代碼
            data: K 線數據

        Returns:
            是否成功
        """
        try:
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

                # 檢查是否已存在
                existing = await session.execute(
                    select(DailyBar).where(
                        DailyBar.stock_code == stock_code,
                        DailyBar.trade_date == data.get("date", date.today()),
                    )
                )
                if existing.scalar_one_or_none():
                    return True  # 已存在，不算失敗

                # 建立 K 線記錄
                bar = DailyBar(
                    stock_code=stock_code,
                    trade_date=data.get("date", date.today()),
                    open_price=data.get("open"),
                    high_price=data.get("high"),
                    low_price=data.get("low"),
                    close_price=data.get("close"),
                    volume=data.get("volume", 0),
                    amount=data.get("amount", 0),
                )
                session.add(bar)
                await session.commit()
                return True
        except Exception as e:
            logger.error(f"儲存 K 線數據失敗 [{stock_code}]: {e}")
            return False


# 全域實例
twse_worker = TWSEWorker()

# 預設追蹤股票列表 (初期手動維護)
DEFAULT_STOCKS = [
    "2330", "2454", "2317", "2303", "2311",  # 半導體
    "2881", "0050", "0056",  # ETF
    "2301", "2408", "2327",  # 電子
    "2801", "2882", "2890",  # 金融
]


async def fetch_all_stocks_daily():
    """
    定時任務: 抓取所有股票日數據
    """
    logger.info("開始執行 TWSE 日數據抓取...")

    success_count = 0
    fail_count = 0

    for stock_code in DEFAULT_STOCKS:
        data = await twse_worker.fetch_daily_data(stock_code)
        if data:
            if await twse_worker.save_daily_bar(stock_code, data):
                success_count += 1
            else:
                fail_count += 1
        else:
            fail_count += 1

        # 隨機延遲避免觸發速率限制
        delay = random.uniform(1.0, 3.0)
        await asyncio.sleep(delay)

    logger.info(f"TWSE 日數據抓取完成: 成功 {success_count}, 失敗 {fail_count}")


async def fetch_single_stock_daily(stock_code: str):
    """
    手動觸發單檔股票數據抓取 (用於 API 調用)
    """
    logger.info(f"手動抓取股票 {stock_code} 數據...")
    data = await twse_worker.fetch_daily_data(stock_code)
    if data:
        await twse_worker.save_daily_bar(stock_code, data)
        logger.info(f"股票 {stock_code} 數據抓取完成")
    else:
        logger.warning(f"無法取得股票 {stock_code} 數據")
