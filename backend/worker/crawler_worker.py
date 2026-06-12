"""
新聞爬蟲 Worker
- 鉅亨網新聞 API（主來源，JSON 格式穩定）
- LLM 情緒評分（Ollama，不可用時規則式 fallback）
- 內容去重 + Redis 快取
"""
import asyncio
import logging
import re
from datetime import datetime, timedelta

import httpx

from app.database import async_session_factory
from app.models.analysis import SentimentData
from app.utils.cache import Cache
from sqlalchemy import select

logger = logging.getLogger(__name__)

# 規則式情緒關鍵詞（LLM 不可用時的 fallback）
_BULLISH_WORDS = ["創高", "新高", "大漲", "漲停", "看好", "成長", "獲利", "營收增", "買超", "加碼", "突破", "強勢", "利多", "擴產", "訂單"]
_BEARISH_WORDS = ["創低", "新低", "大跌", "跌停", "看壞", "衰退", "虧損", "營收減", "賣超", "減碼", "跌破", "弱勢", "利空", "裁員", "砍單"]


def rule_based_score(title: str) -> float:
    """規則式情緒評分（fallback）"""
    score = 0.0
    for w in _BULLISH_WORDS:
        if w in title:
            score += 0.3
    for w in _BEARISH_WORDS:
        if w in title:
            score -= 0.3
    return max(-1.0, min(1.0, score))


class CrawlerWorker:
    """新聞爬蟲服務"""

    def __init__(self):
        self.cache = Cache()

    async def fetch_stock_news(self, stock_code: str, stock_name: str = "") -> list[dict]:
        """
        抓取特定股票的新聞（多來源聚合）

        - 鉅亨網個股 API
        - Google News RSS（聚合經濟日報、工商時報、自由財經等多家媒體）

        Returns:
            [{title, source, url, published_at}, ...]
        """
        cache_key = f"news:{stock_code}:{datetime.now().strftime('%Y%m%d%H')}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        news_list = await self._fetch_cnyes_api(stock_code)
        if stock_name:
            google_news = await self._fetch_google_news_rss(stock_name, limit=10)
            news_list.extend(google_news)

        unique_news = self._deduplicate_news(news_list)
        await self.cache.set(cache_key, unique_news, expire=3600)
        return unique_news

    async def fetch_industry_news(self, industry_name: str, limit: int = 8) -> list[dict]:
        """產業鏈新聞（以產業名搜尋，如「半導體」「光電」）"""
        if not industry_name:
            return []
        cache_key = f"news:industry:{industry_name}:{datetime.now().strftime('%Y%m%d%H')}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        news = await self._fetch_google_news_rss(f"{industry_name} 產業", limit=limit)
        for n in news:
            n["source"] = f"產業·{n['source']}"
        news = self._deduplicate_news(news)
        await self.cache.set(cache_key, news, expire=3600)
        return news

    async def fetch_global_news(self, limit: int = 10) -> list[dict]:
        """全球局勢新聞（美股、聯準會、地緣政治等宏觀面，影響大盤情緒）"""
        cache_key = f"news:global:{datetime.now().strftime('%Y%m%d%H')}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        news = []
        for query in ["美股 台股", "聯準會 利率", "全球經濟"]:
            items = await self._fetch_google_news_rss(query, limit=5)
            news.extend(items)
        for n in news:
            n["source"] = f"全球·{n['source']}"
        news = self._deduplicate_news(news)[:limit]
        await self.cache.set(cache_key, news, expire=3600)
        return news

    async def _fetch_google_news_rss(self, query: str, limit: int = 10) -> list[dict]:
        """
        Google News RSS（繁中台灣版）

        聚合多家媒體（經濟日報、工商時報、自由財經、中央社等），
        無需 API key，標題尾端含媒體名稱。
        """
        try:
            from urllib.parse import quote
            url = f"https://news.google.com/rss/search?q={quote(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }) as client:
                res = await client.get(url)
                if res.status_code != 200:
                    return []

            import xml.etree.ElementTree as ET
            root = ET.fromstring(res.text)
            news = []
            for item in root.iter("item"):
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub = (item.findtext("pubDate") or "").strip()
                source = (item.findtext("source") or "").strip()

                if not title:
                    continue
                # Google News 標題格式為「標題 - 媒體名」，移除尾端媒體名
                if source and title.endswith(f"- {source}"):
                    title = title[: -len(source) - 2].strip()

                try:
                    from email.utils import parsedate_to_datetime
                    published = parsedate_to_datetime(pub).replace(tzinfo=None)
                except Exception:
                    published = datetime.now()

                news.append({
                    "title": title,
                    "source": source or "Google新聞",
                    "url": link,
                    "published_at": published.isoformat(),
                })
                if len(news) >= limit:
                    break
            return news
        except Exception as e:
            logger.warning(f"Google News RSS 抓取失敗 [{query}]: {e}")
            return []

    async def _fetch_cnyes_api(self, stock_code: str) -> list[dict]:
        """鉅亨網個股新聞 API（JSON）"""
        try:
            async with httpx.AsyncClient(timeout=15.0, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Origin": "https://stock.cnyes.com",
                "Referer": f"https://stock.cnyes.com/twstock/{stock_code}",
            }) as client:
                url = "https://ess.api.cnyes.com/ess/api/v1/news/keyword"
                res = await client.get(url, params={"q": stock_code, "limit": 15, "page": 1})
                if res.status_code != 200:
                    return []
                items = res.json().get("data", {}).get("items", [])
                news = []
                for item in items:
                    title = re.sub(r"<[^>]+>", "", item.get("title", "")).strip()
                    if not title:
                        continue
                    pub_ts = item.get("publishAt")
                    published = datetime.fromtimestamp(pub_ts) if pub_ts else datetime.now()
                    news.append({
                        "title": title,
                        "source": "鉅亨網",
                        "url": f"https://news.cnyes.com/news/id/{item.get('newsId', '')}",
                        "published_at": published.isoformat(),
                    })
                return news
        except Exception as e:
            logger.warning(f"鉅亨網新聞 API 失敗 [{stock_code}]: {e}")
            return []

    async def _fetch_cnyes_keyword(self, keyword: str) -> list[dict]:
        """以股名搜尋（fallback）"""
        try:
            async with httpx.AsyncClient(timeout=15.0, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }) as client:
                url = "https://ess.api.cnyes.com/ess/api/v1/news/keyword"
                res = await client.get(url, params={"q": keyword, "limit": 10, "page": 1})
                if res.status_code != 200:
                    return []
                items = res.json().get("data", {}).get("items", [])
                return [{
                    "title": re.sub(r"<[^>]+>", "", i.get("title", "")).strip(),
                    "source": "鉅亨網",
                    "url": f"https://news.cnyes.com/news/id/{i.get('newsId', '')}",
                    "published_at": datetime.fromtimestamp(i["publishAt"]).isoformat() if i.get("publishAt") else datetime.now().isoformat(),
                } for i in items if i.get("title")]
        except Exception as e:
            logger.warning(f"鉅亨網關鍵字搜尋失敗 [{keyword}]: {e}")
            return []

    def _deduplicate_news(self, news_list: list[dict]) -> list[dict]:
        """新聞去重（依正規化標題）"""
        seen_titles = set()
        unique = []
        for news in news_list:
            normalized = re.sub(r'[\d\-\.\/\s【】()（）]', '', news.get("title", ""))
            if normalized and normalized not in seen_titles:
                seen_titles.add(normalized)
                unique.append(news)
        return unique

    async def analyze_and_save(self, stock_code: str | None, stock_name: str, news_list: list[dict]) -> int:
        """
        LLM 情緒評分後存入 sentiment_data（欄位對齊 SentimentData model）

        stock_code=None 表示大盤/全球情緒。
        Returns: 新增筆數
        """
        if not news_list:
            return 0

        from app.services.llm import llm_service

        async with async_session_factory() as session:
            # 過濾已存在的標題（raw_text）
            code_filter = (
                SentimentData.stock_code == stock_code
                if stock_code is not None
                else SentimentData.stock_code.is_(None)
            )
            existing_res = await session.execute(
                select(SentimentData.raw_text).where(
                    code_filter,
                    SentimentData.time >= datetime.now() - timedelta(days=14),
                )
            )
            existing_titles = {r for (r,) in existing_res.all() if r}
            fresh = [n for n in news_list if n["title"] not in existing_titles]
            if not fresh:
                return 0

            titles = [n["title"] for n in fresh]

            # LLM 批次評分；失敗則規則式
            llm_results = await llm_service.score_news_batch(stock_name or stock_code, titles)
            used_llm = llm_results is not None
            if not used_llm:
                llm_results = [{"score": rule_based_score(t), "summary": "規則式評分"} for t in titles]

            saved = 0
            for news, result in zip(fresh, llm_results):
                try:
                    published = datetime.fromisoformat(news["published_at"])
                except (ValueError, TypeError):
                    published = datetime.now()
                session.add(SentimentData(
                    time=published,
                    stock_code=stock_code,
                    source=news.get("source", ""),
                    sentiment_score=result["score"],
                    confidence=0.8 if used_llm else 0.4,
                    raw_text=news["title"],
                    llm_summary=result.get("summary", ""),
                ))
                saved += 1

            await session.commit()
            logger.info(f"{stock_code} 情緒分析完成: {saved} 筆（{'LLM' if used_llm else '規則式'}）")
            return saved


# 全域實例
crawler_worker = CrawlerWorker()


async def fetch_and_analyze_stock(stock_code: str, stock_name: str = "") -> int:
    """
    抓取 + 評分單檔股票新聞（API 端點與排程共用）

    包含：個股新聞（鉅亨 + Google News）+ 產業鏈新聞
    """
    news = await crawler_worker.fetch_stock_news(stock_code, stock_name)

    # 產業鏈新聞（依股票的產業類別）
    try:
        from app.models.stock import Stock
        async with async_session_factory() as session:
            result = await session.execute(
                select(Stock.industry_name).where(Stock.code == stock_code)
            )
            industry = result.scalar_one_or_none()
        if industry:
            industry_news = await crawler_worker.fetch_industry_news(industry, limit=5)
            news.extend(industry_news)
    except Exception as e:
        logger.warning(f"{stock_code} 產業新聞抓取失敗: {e}")

    if not news:
        return 0
    return await crawler_worker.analyze_and_save(stock_code, stock_name, news)


async def fetch_and_analyze_global() -> int:
    """抓取 + 評分全球局勢新聞（存為大盤情緒 stock_code=NULL，影響貪婪恐懼指數）"""
    news = await crawler_worker.fetch_global_news(limit=10)
    if not news:
        return 0
    return await crawler_worker.analyze_and_save(None, "台股大盤", news)


async def fetch_news():
    """
    定時任務: 抓取所有股票的新聞並評分
    （DB stocks 表中的所有股票）
    """
    logger.info("開始執行新聞爬蟲...")
    from app.models.stock import Stock

    # 全球局勢新聞（大盤情緒）
    try:
        global_saved = await fetch_and_analyze_global()
        logger.info(f"全球新聞: 儲存 {global_saved} 筆")
    except Exception as e:
        logger.warning(f"全球新聞抓取失敗: {e}")

    async with async_session_factory() as session:
        result = await session.execute(select(Stock.code, Stock.name))
        stocks = result.all()

    total_saved = 0
    for stock_code, stock_name in stocks:
        try:
            saved = await fetch_and_analyze_stock(stock_code, stock_name or "")
            total_saved += saved
        except Exception as e:
            logger.warning(f"{stock_code} 新聞處理失敗: {e}")
        await asyncio.sleep(2)  # 延遲避免過載

    logger.info(f"新聞爬蟲完成: 總共儲存 {total_saved} 筆")


async def fetch_single_stock_news(stock_code: str, stock_name: str = ""):
    """手動觸發單檔股票新聞抓取"""
    saved = await fetch_and_analyze_stock(stock_code, stock_name)
    logger.info(f"{stock_code} 新聞抓取完成: {saved} 筆")
