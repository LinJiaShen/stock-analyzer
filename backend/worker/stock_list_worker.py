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

    @staticmethod
    def _classify_type(code: str) -> str:
        """依代碼規則分類：00 開頭=ETF/債券ETF，其餘 4 碼數字=個股"""
        if code.startswith("00"):
            return "etf"
        return "stock"

    async def fetch_twse_stocks(self) -> list[dict]:
        """
        從 TWSE OpenAPI 抓取上市股票列表（含 ETF）

        資料來源：STOCK_DAY_ALL（每日全市場行情，含代碼與名稱）
        """
        logger.info("正在從 TWSE OpenAPI 抓取上市股票列表...")
        stocks = []

        url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
        client = await self._get_session()

        try:
            response = await client.get(url)
            response.raise_for_status()
            items = response.json()

            for item in items:
                code = (item.get("Code") or "").strip()
                name = (item.get("Name") or "").strip()
                if not code or not name:
                    continue
                stocks.append({
                    "code": code,
                    "name": name,
                    "market": "twse",
                    "type": self._classify_type(code),
                })
        except Exception as e:
            logger.error(f"TWSE OpenAPI 抓取失敗: {e}")

        logger.info(f"TWSE 上市股票抓取完成: {len(stocks)} 筆")
        return stocks

    async def fetch_tpex_stocks(self) -> list[dict]:
        """
        從 TPEx OpenAPI 抓取上櫃股票列表（含 ETF）
        """
        logger.info("正在從 TPEx OpenAPI 抓取上櫃股票列表...")
        stocks = []

        url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
        client = await self._get_session()

        try:
            response = await client.get(url)
            response.raise_for_status()
            items = response.json()

            for item in items:
                code = (item.get("SecuritiesCompanyCode") or "").strip()
                name = (item.get("CompanyName") or "").strip()
                if not code or not name:
                    continue
                stocks.append({
                    "code": code,
                    "name": name,
                    "market": "tpex",
                    "type": self._classify_type(code),
                })
        except Exception as e:
            logger.error(f"TPEx OpenAPI 抓取失敗: {e}")

        logger.info(f"TPEx 上櫃股票抓取完成: {len(stocks)} 筆")
        return stocks

    async def fetch_etf_list(self) -> list[dict]:
        """
        ETF 已包含在 TWSE/TPEx OpenAPI 結果中（00 開頭代碼自動分類為 etf），
        此函式保留介面相容性，不再額外抓取。
        """
        return []

    # TWSE 產業別代碼對照（上市/上櫃通用）
    INDUSTRY_CODES = {
        "01": "水泥工業", "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維",
        "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙工業",
        "10": "鋼鐵工業", "11": "橡膠工業", "12": "汽車工業", "14": "建材營造",
        "15": "航運業", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨",
        "19": "綜合", "20": "其他", "21": "化學工業", "22": "生技醫療",
        "23": "油電燃氣", "24": "半導體", "25": "電腦及週邊設備", "26": "光電",
        "27": "通信網路", "28": "電子零組件", "29": "電子通路", "30": "資訊服務",
        "31": "其他電子", "32": "文化創意", "33": "農業科技", "34": "電子商務",
        "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活",
    }

    async def sync_industries(self) -> int:
        """
        從 TWSE/TPEx 公司基本資料 OpenAPI 同步產業別

        Returns: 更新筆數
        """
        logger.info("正在同步產業別資料...")
        client = await self._get_session()
        industry_map: dict[str, str] = {}

        # 上市公司基本資料
        try:
            res = await client.get("https://openapi.twse.com.tw/v1/opendata/t187ap03_L")
            res.raise_for_status()
            for item in res.json():
                code = (item.get("公司代號") or "").strip()
                ind = (item.get("產業別") or "").strip()
                if code and ind:
                    industry_map[code] = ind
        except Exception as e:
            logger.warning(f"TWSE 公司基本資料抓取失敗: {e}")

        # 上櫃公司基本資料
        try:
            res = await client.get("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O")
            res.raise_for_status()
            for item in res.json():
                code = (item.get("SecuritiesCompanyCode") or item.get("公司代號") or "").strip()
                ind = (item.get("SecuritiesIndustryCode") or item.get("產業別") or "").strip()
                if code and ind:
                    industry_map[code] = ind
        except Exception as e:
            logger.warning(f"TPEx 公司基本資料抓取失敗: {e}")

        if not industry_map:
            return 0

        updated = 0
        async with async_session_factory() as session:
            result = await session.execute(select(Stock))
            for stock in result.scalars().all():
                ind_code = industry_map.get(stock.code)
                if ind_code:
                    ind_name = self.INDUSTRY_CODES.get(ind_code.zfill(2), f"產業{ind_code}")
                    stock.industry_code = ind_code
                    stock.industry_name = ind_name
                    updated += 1
            await session.commit()

        logger.info(f"產業別同步完成: {updated} 筆")
        return updated

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

    # 同步產業別（公司基本資料）
    try:
        result["industries_updated"] = await stock_list_worker.sync_industries()
    except Exception as e:
        logger.warning(f"產業別同步失敗: {e}")
    logger.info(f"股票列表同步完成: {result}")
    return result
