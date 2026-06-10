"""
新聞爬蟲 Worker
- 多來源新聞抓取
- 反爬蟲防護
- 內容去重
"""
import asyncio
import logging
import re
from datetime import datetime

import httpx

from app.database import async_session_factory
from app.models.analysis import SentimentData
from app.utils.cache import Cache
from sqlalchemy import select, func

logger = logging.getLogger(__name__)


class CrawlerWorker:
    """新聞爬蟲服務"""

    def __init__(self):
        self.cache = Cache()
        self._session: httpx.AsyncClient | None = None

    async def _get_session(self) -> httpx.AsyncClient:
        if self._session is None or self._session.is_closed:
            self._session = httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-TW,zh-Hant;q=0.9,en;q=0.8",
                },
                follow_redirects=True,
            )
        return self._session

    async def fetch_stock_news(self, stock_code: str, stock_name: str = "") -> list[dict]:
        """
        抓取特定股票的新聞

        Args:
            stock_code: 股票代碼
            stock_name: 股票名稱

        Returns:
            新聞列表
        """
        cache_key = f"news:{stock_code}:{datetime.now().strftime('%Y%m%d')}"

        # 檢查快取 (2 小時)
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        news_list = []

        # 來源 1: Yahoo 財經新聞
        yahoo_news = await self._fetch_yahoo_finance_news(stock_code, stock_name)
        news_list.extend(yahoo_news)

        # 來源 2: 鉅亨網
        cnyes_news = await self._fetch_cnyes_news(stock_code)
        news_list.extend(cnyes_news)

        # 去重 (依標題相似度)
        unique_news = self._deduplicate_news(news_list)

        # 快取
        await self.cache.set(cache_key, unique_news, expire=7200)

        return unique_news

    async def _fetch_yahoo_finance_news(self, stock_code: str, stock_name: str) -> list[dict]:
        """抓取 Yahoo 財經新聞"""
        try:
            client = await self._get_session()
            search_url = "https://tw.finance.yahoo.com/search"
            params = {"q": f"{stock_code} {stock_name}"}

            response = await client.get(search_url, params=params)
            if response.status_code != 200:
                return []

            # 簡化版: 從 HTML 提取新聞標題
            # 實際部署時應使用 BeautifulSoup 或改用 RSS
            content = response.text
            titles = re.findall(r'<a[^>]*class="[^"]*Fz\(m\)[^>]*>([^<]+)</a>', content)

            news = []
            for title in titles[:10]:  # 限制 10 筆
                news.append({
                    "title": title.strip(),
                    "source": "Yahoo Finance",
                    "url": f"https://tw.finance.yahoo.com/search?q={stock_code}",
                    "published_at": datetime.now(),
                    "stock_code": stock_code,
                })

            return news
        except Exception as e:
            logger.warning(f"Yahoo 財經新聞抓取失敗 [{stock_code}]: {e}")
            return []

    async def _fetch_cnyes_news(self, stock_code: str) -> list[dict]:
        """抓取鉅亨網新聞"""
        try:
            client = await self._get_session()
            url = f"https://stock.cnyes.com/stock/{stock_code}"

            response = await client.get(url)
            if response.status_code != 200:
                return []

            # 簡化版: 提取新聞標題
            content = response.text
            titles = re.findall(r'<a[^>]*href="[^"]*news[^"]*"[^>]*>([^<]+)</a>', content)

            news = []
            for title in titles[:5]:
                news.append({
                    "title": title.strip(),
                    "source": "鉅亨網",
                    "url": f"https://stock.cnyes.com/stock/{stock_code}",
                    "published_at": datetime.now(),
                    "stock_code": stock_code,
                })

            return news
        except Exception as e:
            logger.warning(f"鉅亨網新聞抓取失敗 [{stock_code}]: {e}")
            return []

    def _deduplicate_news(self, news_list: list[dict]) -> list[dict]:
        """
        新聞去重 (依標題相似度)

        Args:
            news_list: 新聞列表

        Returns:
            去重後的新聞列表
        """
        seen_titles = set()
        unique = []

        for news in news_list:
            # 簡化標題 (移除數字、特殊字元)
            normalized = re.sub(r'[\d\-\.\/\s]', '', news.get("title", ""))
            if normalized and normalized not in seen_titles:
                seen_titles.add(normalized)
                unique.append(news)

        return unique

    async def save_news_to_db(self, stock_code: str, news_list: list[dict]) -> int:
        """
        將新聞存入資料庫

        Args:
            stock_code: 股票代碼
            news_list: 新聞列表

        Returns:
            成功儲存的筆數
        """
        saved = 0
        async with async_session_factory() as session:
            for news in news_list:
                # 檢查是否已存在 (依標題)
                existing = await session.execute(
                    select(SentimentData).where(
                        SentimentData.stock_code == stock_code,
                        SentimentData.title == news.get("title"),
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                sentiment = SentimentData(
                    stock_code=stock_code,
                    title=news.get("title", ""),
                    content=news.get("content", ""),
                    source=news.get("source", ""),
                    url=news.get("url", ""),
                    published_at=news.get("published_at", datetime.now()),
                    sentiment_score=0.0,  # 待 LLM 分析
                    sentiment_label="neutral",
                )
                session.add(sentiment)
                saved += 1

            await session.commit()
            return saved


# 全域實例
crawler_worker = CrawlerWorker()


async def fetch_news():
    """
    定時任務: 抓取所有追蹤股票的新聞
    """
    logger.info("開始執行新聞爬蟲...")

    # 追蹤股票列表
    stocks = [
        ("2330", "台積電"),
        ("2454", "聯發科"),
        ("2317", "鴻海"),
        ("2303", "聯電"),
        ("2311", "台達電"),
    ]

    total_saved = 0
    for stock_code, stock_name in stocks:
        news = await crawler_worker.fetch_stock_news(stock_code, stock_name)
        if news:
            saved = await crawler_worker.save_news_to_db(stock_code, news)
            total_saved += saved
            logger.info(f"  {stock_code}: 取得 {len(news)} 筆, 儲存 {saved} 筆")

        # 延遲避免過載
        await asyncio.sleep(2)

    logger.info(f"新聞爬蟲完成: 總共儲存 {total_saved} 筆")


async def fetch_single_stock_news(stock_code: str, stock_name: str = ""):
    """
    手動觸發單檔股票新聞抓取
    """
    logger.info(f"手動抓取 {stock_code} 新聞...")
    news = await crawler_worker.fetch_stock_news(stock_code, stock_name)
    if news:
        saved = await crawler_worker.save_news_to_db(stock_code, news)
        logger.info(f"{stock_code} 新聞抓取完成: {saved} 筆")
    else:
        logger.warning(f"無法取得 {stock_code} 新聞")
