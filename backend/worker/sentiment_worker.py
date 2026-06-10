"""
情緒分析 Worker
- 使用 Ollama LLM 分析新聞情緒
- 批次處理提高效率
"""
import json
import logging
from datetime import datetime

import httpx

from app.config import settings
from app.database import async_session_factory
from app.models.analysis import SentimentData
from app.utils.cache import Cache
from sqlalchemy import select, and_

logger = logging.getLogger(__name__)

# LLM 情緒分析提示詞
SENTIMENT_PROMPT = """
你是一位專業的金融情緒分析師。請分析以下新聞標題的情緒傾向。

新聞標題: {title}
新聞來源: {source}

請以 JSON 格式回傳分析結果:
{{
  "score": -1.0 到 1.0 之間的數值 (-1 極度看空, 0 中性, 1 極度看多),
  "label": "bullish" / "bearish" / "neutral",
  "reason": "簡短的分析理由 (10 字以內)"
}}
"""


class SentimentWorker:
    """情緒分析服務"""

    def __init__(self):
        self.cache = Cache()
        self._session: httpx.AsyncClient | None = None

    async def _get_session(self) -> httpx.AsyncClient:
        if self._session is None or self._session.is_closed:
            self._session = httpx.AsyncClient(timeout=60.0)
        return self._session

    async def analyze_sentiment(self, title: str, source: str = "") -> dict:
        """
        使用 LLM 分析單則新聞情緒

        Args:
            title: 新聞標題
            source: 新聞來源

        Returns:
            情緒分析結果 {"score": float, "label": str, "reason": str}
        """
        # 檢查快取
        cache_key = f"sentiment:{title[:50]}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        prompt = SENTIMENT_PROMPT.format(title=title, source=source)

        try:
            client = await self._get_session()
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                },
            )
            response.raise_for_status()
            result = response.json()

            # 解析 LLM 回傳的 JSON
            llm_output = json.loads(result.get("response", "{}"))
            analysis = {
                "score": float(llm_output.get("score", 0.0)),
                "label": llm_output.get("label", "neutral"),
                "reason": llm_output.get("reason", ""),
            }

            # 快存 24 小時
            await self.cache.set(cache_key, analysis, expire=86400)
            return analysis

        except httpx.HTTPError as e:
            logger.warning(f"LLM 連線失敗: {e}")
            return {"score": 0.0, "label": "neutral", "reason": "LLM 不可用"}
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"LLM 回應解析失敗: {e}")
            return {"score": 0.0, "label": "neutral", "reason": "解析失敗"}
        except Exception as e:
            logger.error(f"情緒分析失敗: {e}")
            return {"score": 0.0, "label": "neutral", "reason": "分析失敗"}

    async def analyze_batch(self, news_list: list[dict]) -> list[dict]:
        """
        批次分析多則新聞情緒

        Args:
            news_list: 新聞列表 [{"title": str, "source": str}, ...]

        Returns:
            帶情緒分析的新聞列表
        """
        results = []
        for news in news_list:
            analysis = await self.analyze_sentiment(
                news.get("title", ""),
                news.get("source", ""),
            )
            results.append({**news, **analysis})
            # 避免過載 LLM
            await asyncio.sleep(0.5)
        return results

    async def update_sentiment_in_db(self, stock_code: str) -> int:
        """
        更新資料庫中未分析的新聞情緒

        Args:
            stock_code: 股票代碼

        Returns:
            更新的筆數
        """
        updated = 0
        async with async_session_factory() as session:
            # 找出未分析的新聞 (score = 0 且 label = neutral)
            result = await session.execute(
                select(SentimentData).where(
                    and_(
                        SentimentData.stock_code == stock_code,
                        SentimentData.sentiment_score == 0.0,
                        SentimentData.sentiment_label == "neutral",
                    )
                ).limit(20)  # 每次最多處理 20 筆
            )
            news_items = result.scalars().all()

            for item in news_items:
                analysis = await self.analyze_sentiment(item.title, item.source)
                item.sentiment_score = analysis["score"]
                item.sentiment_label = analysis["label"]
                item.analyzed_at = datetime.now()
                updated += 1

            if updated > 0:
                await session.commit()

        return updated


import asyncio

# 全域實例
sentiment_worker = SentimentWorker()


async def analyze_all_holdings():
    """
    定時任務: 分析所有未處理的新聞情緒
    """
    logger.info("開始執行情緒分析...")

    # 追蹤股票列表
    stocks = ["2330", "2454", "2317", "2303", "2311"]

    total_updated = 0
    for stock_code in stocks:
        updated = await sentiment_worker.update_sentiment_in_db(stock_code)
        total_updated += updated
        if updated > 0:
            logger.info(f"  {stock_code}: 更新 {updated} 筆情緒分析")

        await asyncio.sleep(1)

    logger.info(f"情緒分析完成: 總共更新 {total_updated} 筆")


async def analyze_single_news(title: str, source: str = "") -> dict:
    """
    手動觸發單則新聞情緒分析
    """
    logger.info(f"手動分析情緒: {title[:30]}...")
    result = await sentiment_worker.analyze_sentiment(title, source)
    logger.info(f"情緒分析結果: score={result['score']}, label={result['label']}")
    return result
