"""
情緒分析服務
- LLM 基於新聞的情緒評分
- 市場情緒指標
- 個股新聞情緒分析
"""

from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
import numpy as np

from app.models.analysis import SentimentData
from app.utils.cache import Cache


class SentimentService:
    """情緒分析服務"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.cache = Cache()

    async def _fetch_sentiment_data(self, stock_code: str, days: int = 7) -> list[SentimentData]:
        """取得情緒數據"""
        cutoff_date = datetime.now() - timedelta(days=days)
        stmt = (
            select(SentimentData)
            .where(
                SentimentData.stock_code == stock_code,
                SentimentData.time >= cutoff_date,
            )
            .order_by(desc(SentimentData.time))
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def analyze_news_sentiment(self, stock_code: str, days: int = 7) -> dict:
        """
        新聞情緒分析
        - 正面/負面/中性新聞比例
        - 情緒分數趨勢
        - 關鍵詞提取
        """
        sentiment_data_list = await self._fetch_sentiment_data(stock_code, days)

        if not sentiment_data_list:
            return {
                "positive_ratio": 0,
                "negative_ratio": 0,
                "neutral_ratio": 1,
                "avg_sentiment_score": 0,
                "trend": "neutral",
                "signal": "neutral",
                "news_count": 0,
                "keywords": [],
            }

        # 計算情緒比例（Numeric → float）
        scores = [float(s.sentiment_score or 0) for s in sentiment_data_list]
        positive_count = sum(1 for s in scores if s > 0.1)
        negative_count = sum(1 for s in scores if s < -0.1)
        neutral_count = len(scores) - positive_count - negative_count

        total = len(scores)
        positive_ratio = positive_count / total
        negative_ratio = negative_count / total
        neutral_ratio = neutral_count / total

        avg_score = np.mean(scores)

        # 判斷趨勢
        if len(scores) >= 5:
            recent_avg = np.mean(scores[:3])
            old_avg = np.mean(scores[3:6])
            if recent_avg > old_avg + 0.1:
                trend = "improving"
            elif recent_avg < old_avg - 0.1:
                trend = "worsening"
            else:
                trend = "stable"
        else:
            trend = "stable"

        # 訊號判斷
        if avg_score > 0.3:
            signal = "bullish"
        elif avg_score < -0.3:
            signal = "bearish"
        else:
            signal = "neutral"

        # 關鍵詞 (從標題中提取)
        keywords = []
        for s in sentiment_data_list[:10]:
            if s.raw_text:
                # 簡單關鍵詞提取 (實際應使用 NLP)
                words = s.raw_text.split()
                keywords.extend(words[:5])

        return {
            "positive_ratio": round(positive_ratio, 3),
            "negative_ratio": round(negative_ratio, 3),
            "neutral_ratio": round(neutral_ratio, 3),
            "avg_sentiment_score": round(float(avg_score), 3),
            "trend": trend,
            "signal": signal,
            "news_count": total,
            "keywords": keywords[:20],
        }

    async def analyze_market_sentiment(self) -> dict:
        """
        整體市場情緒分析
        - 加權平均情緒分數
        - 市場恐慌/貪婪指標
        """
        # 取得最近 7 天的所有情緒數據
        cutoff_date = datetime.now() - timedelta(days=7)
        stmt = (
            select(SentimentData)
            .where(SentimentData.time >= cutoff_date)
            .order_by(desc(SentimentData.time))
        )
        result = await self.db.execute(stmt)
        all_data = result.scalars().all()

        if not all_data:
            return {
                "overall_score": 0,
                "fear_greed_index": 50,
                "signal": "neutral",
            }

        scores = [float(s.sentiment_score or 0) for s in all_data]
        overall_score = float(np.mean(scores))

        # 恐慌/貪婪指數 (0-100)
        # -1 ~ 1 映射到 0 ~ 100
        fear_greed_index = int((overall_score + 1) / 2 * 100)
        fear_greed_index = max(0, min(100, fear_greed_index))

        if fear_greed_index >= 80:
            signal = "extreme_greed"
        elif fear_greed_index >= 60:
            signal = "greed"
        elif fear_greed_index >= 40:
            signal = "neutral"
        elif fear_greed_index >= 20:
            signal = "fear"
        else:
            signal = "extreme_fear"

        return {
            "overall_score": round(overall_score, 3),
            "fear_greed_index": fear_greed_index,
            "signal": signal,
        }

    async def _ensure_news_data(self, stock_code: str, days: int) -> None:
        """無近期新聞資料時，即時抓取並評分（首次查詢約需 5-30 秒）"""
        existing = await self._fetch_sentiment_data(stock_code, days)
        if existing:
            return
        try:
            from sqlalchemy import select as sa_select
            from app.models.stock import Stock
            from worker.crawler_worker import fetch_and_analyze_stock

            result = await self.db.execute(sa_select(Stock.name).where(Stock.code == stock_code))
            stock_name = result.scalar_one_or_none() or ""
            await fetch_and_analyze_stock(stock_code, stock_name)
        except Exception:
            pass  # 抓取失敗時以無資料狀態回應

    async def get_recent_news(self, stock_code: str, days: int = 7, limit: int = 15) -> list[dict]:
        """近期新聞列表（含個別情緒評分）"""
        data = await self._fetch_sentiment_data(stock_code, days)
        return [
            {
                "title": s.raw_text,
                "source": s.source,
                "time": s.time.isoformat() if s.time else None,
                "sentiment_score": float(s.sentiment_score or 0),
                "summary": s.llm_summary or "",
            }
            for s in data[:limit]
            if s.raw_text
        ]

    async def analyze(self, stock_code: str, days: int = 7) -> dict:
        """
        完整情緒分析
        """
        # 無資料時即時抓取新聞並以 LLM 評分
        await self._ensure_news_data(stock_code, days)

        news_sentiment = await self.analyze_news_sentiment(stock_code, days)
        market_sentiment = await self.analyze_market_sentiment()
        recent_news = await self.get_recent_news(stock_code, days)

        # 綜合評分
        score = 50  # 基準分

        # 新聞情緒加減分
        news_score = news_sentiment["avg_sentiment_score"]
        score += int(news_score * 30)  # -30 ~ +30

        # 市場情緒加減分
        market_score = market_sentiment["overall_score"]
        score += int(market_score * 20)  # -20 ~ +20

        # 限制範圍 0-100
        score = max(0, min(100, score))

        # 綜合訊號
        if score >= 70:
            overall_signal = "strong_buy"
        elif score >= 60:
            overall_signal = "buy"
        elif score >= 40:
            overall_signal = "neutral"
        elif score >= 30:
            overall_signal = "sell"
        else:
            overall_signal = "strong_sell"

        return {
            "stock_code": stock_code,
            "score": score,
            "signal": overall_signal,
            "news_sentiment": news_sentiment,
            "market_sentiment": market_sentiment,
            "news": recent_news,
            "method": "新聞標題經本地 LLM（Ollama）逐則評分 -1.0~1.0，加權平均後映射至 0-100；市場情緒以全市場新聞均值計算貪婪恐懼指數",
            "analyzed_at": datetime.now().isoformat(),
        }
