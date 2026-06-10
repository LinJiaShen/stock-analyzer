"""
台灣股票代碼管理 Worker
- 從 Yahoo Finance 抓取上市/上櫃/ETF 代碼列表
- 同步到 Stock 資料表
"""
import asyncio
import logging
from datetime import date

import httpx

from app.database import async_session_factory
from app.models.stock import Stock
from sqlalchemy import select, delete

logger = logging.getLogger(__name__)

# Yahoo Finance 的台灣股票市場代碼
TAIWAN_MARKET_URL = "https://query1.finance.yahoo.com/v7/finance/quote"

# 台灣主要市場分類
MARKET_CATEGORIES = {
    "twse": {  # 上市 (TWSE)
        "market": "TWO",
        "scrape_url": "https://www.twse.com.tw/rwd/zh/exchangeMarket/stockQuery",
    },
    "tpex": {  # 上櫃 (TPEx)
        "market": "TWO",
        "scrape_url": "https://www.tpex.org.tw/web/stock/stock_query/query_result.php",
    },
}

# 熱門 ETF 代碼列表 (手動維護 + 動態抓取)
POPULAR_ETFS = [
    "0050", "0050P", "00620F", "0056", "00620B",
    "00620R", "00620T", "00620L", "00620K", "00620J",
    "0054", "0058", "006201", "006202", "006203",
    "006204", "006205", "006206", "006207", "006208",
    "006209", "00620A", "00620C", "00620D", "00620E",
    "00620F", "00620G", "00620H", "00620I", "00620M",
    "00620N", "00620P", "00620Q", "00620S", "00620U",
    "00620V", "00620W", "00620X", "00620Y", "00620Z",
    "006210", "006211", "006212", "006213", "006214",
    "006215", "006216", "006217", "006218", "006219",
    "00621A", "00621B", "00621C", "00621D", "00621E",
    "00621F", "00621G", "00621H", "00621J", "00621K",
    "00621L", "00621M", "00621N", "00621P", "00621Q",
    "00621R", "00621S", "00621T", "00621U", "00621V",
    "00621W", "00621X", "00621Y", "00621Z",
]


class StockListWorker:
    """台灣股票代碼管理服務"""

    def __init__(self):
        self._session: httpx.AsyncClient | None = None

    async def _get_session(self) -> httpx.AsyncClient:
        if self._session is None or self._session.is_closed:
            self._session = httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/json",
                    "Referer": "https://www.twse.com.tw",
                },
            )
        return self._session

    async def fetch_twse_stocks(self) -> list[dict]:
        """
        從 TWSE 抓取上市股票列表

        Returns:
            股票資料列表
        """
        logger.info("正在從 TWSE 抓取上市股票列表...")
        stocks = []

        # TWSE 提供 JSON API
        url = "https://www.twse.com.tw/rwd/zh/exchangeMarket/stockQuery"
        params = {
            "response": "json",
            "date": date.today().isoformat(),
            "step": 1000,  # 一次抓 1000 筆
            "offset": 0,
        }

        client = await self._get_session()
        offset = 0
        total = None

        while True:
            params["offset"] = offset
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()

                meta = data.get("meta", {})
                if meta.get("error"):
                    logger.error(f"TWSE API 錯誤: {meta['error']}")
                    break

                items = data.get("outputs", [])
                if not items:
                    break

                for item in items:
                    stocks.append({
                        "code": item.get("SECURITY_CODE", ""),
                        "name": item.get("SECURITY_NAME_ABBR", ""),
                        "market": "twse",
                        "type": "stock",
                    })

                total = data.get("total", 0)
                offset += 1000

                if total and offset >= total:
                    break

                await asyncio.sleep(0.5)  # 速率限制

            except Exception as e:
                logger.error(f"TWSE 抓取失敗: {e}")
                break

        logger.info(f"TWSE 上市股票抓取完成: {len(stocks)} 筆")
        return stocks

    async def fetch_tpex_stocks(self) -> list[dict]:
        """
        從 TPEx 抓取上櫃股票列表

        Returns:
            股票資料列表
        """
        logger.info("正在從 TPEx 抓取上櫃股票列表...")
        stocks = []

        # TPEx 也提供 JSON API
        url = "https://www.tpex.org.tw/web/stock/stock_query/query_result.php"
        params = {
            "type": "A",  # A=股票
            "order": "market_no",
            "order_type": "ASC",
            "page": 1,
            "per_page": 1000,
        }

        client = await self._get_session()
        page = 1
        total = None

        while True:
            params["page"] = page
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()

                items = data.get("data", [])
                if not items:
                    break

                for item in items:
                    stocks.append({
                        "code": item.get("market_no", ""),
                        "name": item.get("stock_name", ""),
                        "market": "tpex",
                        "type": "stock",
                    })

                pagination = data.get("pagination", {})
                total = pagination.get("total", 0)
                page += 1

                if total and (page - 1) * 1000 >= total:
                    break

                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"TPEx 抓取失敗: {e}")
                break

        logger.info(f"TPEx 上櫃股票抓取完成: {len(stocks)} 筆")
        return stocks

    async def fetch_etf_list(self) -> list[dict]:
        """
        從 TWSE + TPEx 抓取 ETF 列表

        Returns:
            ETF 資料列表
        """
        logger.info("正在抓取 ETF 列表...")
        etfs = []

        # TWSE ETF
        url = "https://www.twse.com.tw/rwd/zh/exchangeMarket/stockQuery"
        params = {
            "response": "json",
            "date": date.today().isoformat(),
            "step": 1000,
            "offset": 0,
            "marketI": "J",  # J=ETF
        }

        client = await self._get_session()

        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            items = data.get("outputs", [])
            for item in items:
                etfs.append({
                    "code": item.get("SECURITY_CODE", ""),
                    "name": item.get("SECURITY_NAME_ABBR", ""),
                    "market": "twse",
                    "type": "etf",
                })

            # TPEx ETF
            params["marketI"] = "K"  # TPEx ETF
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            items = data.get("outputs", [])
            for item in items:
                etfs.append({
                    "code": item.get("SECURITY_CODE", ""),
                    "name": item.get("SECURITY_NAME_ABBR", ""),
                    "market": "tpex",
                    "type": "etf",
                })

        except Exception as e:
            logger.error(f"ETF 抓取失敗: {e}")

        logger.info(f"ETF 列表抓取完成: {len(etfs)} 筆")
        return etfs

    async def sync_to_database(self, stocks: list[dict]) -> dict:
        """
        將股票列表同步到資料庫

        Args:
            stocks: 股票資料列表

        Returns:
            統計資訊 (added, updated, total)
        """
        async with async_session_factory() as session:
            added = 0
            updated = 0

            for stock_data in stocks:
                code = stock_data.get("code", "").strip()
                if not code:
                    continue

                existing = await session.execute(
                    select(Stock).where(Stock.code == code)
                )
                stock = existing.scalar_one_or_none()

                if stock:
                    # 更新名稱和市場
                    if stock.name != stock_data["name"]:
                        stock.name = stock_data["name"]
                        stock.market = stock_data.get("market", stock.market)
                        stock.stock_type = stock_data.get("type", stock.stock_type)
                        updated += 1
                else:
                    # 新增
                    new_stock = Stock(
                        code=code,
                        name=stock_data["name"],
                        market=stock_data.get("market", "unknown"),
                        stock_type=stock_data.get("type", "stock"),
                    )
                    session.add(new_stock)
                    added += 1

            await session.commit()
            logger.info(f"股票資料同步完成: 新增 {added}, 更新 {updated}, 總計 {len(stocks)}")
            return {"added": added, "updated": updated, "total": len(stocks)}


# 全域實例
stock_list_worker = StockListWorker()


async def sync_all_stock_list():
    """定時任務: 同步所有股票列表"""
    logger.info("開始同步股票列表...")

    all_stocks = []

    # 抓取上市股票
    twse_stocks = await stock_list_worker.fetch_twse_stocks()
    all_stocks.extend(twse_stocks)

    # 抓取上櫃股票
    tpex_stocks = await stock_list_worker.fetch_tpex_stocks()
    all_stocks.extend(tpex_stocks)

    # 抓取 ETF
    etf_stocks = await stock_list_worker.fetch_etf_list()
    all_stocks.extend(etf_stocks)

    # 同步到資料庫
    result = await stock_list_worker.sync_to_database(all_stocks)
    logger.info(f"股票列表同步完成: {result}")
    return result


async def sync_stock_list(category: str = "all"):
    """
    手動觸發股票列表同步

    Args:
        category: 同步類別 (all, twse, tpex, etf)
    """
    logger.info(f"手動同步股票列表: {category}")
    all_stocks = []

    if category in ("all", "twse"):
        all_stocks.extend(await stock_list_worker.fetch_twse_stocks())
    if category in ("all", "tpex"):
        all_stocks.extend(await stock_list_worker.fetch_tpex_stocks())
    if category in ("all", "etf"):
        all_stocks.extend(await stock_list_worker.fetch_etf_list())

    result = await stock_list_worker.sync_to_database(all_stocks)
    logger.info(f"股票列表同步完成: {result}")
    return result
