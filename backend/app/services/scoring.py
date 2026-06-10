"""
決策評分服務
- 多因子綜合評分
- 雷達圖數據計算
- 決策樹訊號產生
- K 線形態因子整合
"""

from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import numpy as np

from app.models.stock import Stock
from app.models.daily_bar import DailyBar
from app.services.technical import TechnicalService
from app.services.chip import ChipService
from app.services.sentiment import SentimentService
from app.services.industry import IndustryService
from app.services.pattern import PatternService


class ScoringService:
    """決策評分服務"""

    # 各維度權重（總和 = 1.0）
    WEIGHTS = {
        "technical": 0.25,
        "chip": 0.25,
        "fundamental": 0.20,
        "sentiment": 0.20,
        "pattern": 0.10,
    }

    def __init__(self, db: AsyncSession):
        self.db = db
        self.tech_service = TechnicalService(db)
        self.chip_service = ChipService(db)
        self.sentiment_service = SentimentService(db)
        self.industry_service = IndustryService(db)
        self.pattern_service = PatternService()

    async def calculate_composite_score(self, stock_code: str) -> dict:
        """
        多因子綜合評分
        回傳 0-100 的綜合戰鬥力分數
        包含: 技術面、籌碼面、基本面、情緒面、K線形態
        """
        # 並行取得各維度分析
        technical = await self.tech_service.analyze(stock_code, "medium")
        chip = await self.chip_service.analyze(stock_code, 90)
        sentiment = await self.sentiment_service.analyze(stock_code, 7)
        industry = await self.industry_service.analyze(stock_code, 30)

        # K 線形態分析
        bars = await self.tech_service._fetch_bars(stock_code, days=120)
        patterns = self.pattern_service.detect_all(bars)
        pattern_score = self.pattern_service.get_pattern_score(patterns)
        # 將 -100~100 轉換為 0~100
        pattern_norm = (pattern_score + 100) / 2

        # 只保留最近 10 根 K 線內的形態（用於前端顯示）
        max_idx = len(bars) - 1 if bars else 0
        recent_patterns = self.pattern_service.get_recent_patterns(
            patterns, max_idx, lookback=10
        )

        tech_score = technical.get("score", 50)
        chip_score = chip.get("score", 50)
        sentiment_score = sentiment.get("score", 50)
        fundamental_score = industry.get("score", 50)

        # 加權計算（包含 K 線形態）
        total_score = (
            tech_score * self.WEIGHTS["technical"]
            + chip_score * self.WEIGHTS["chip"]
            + fundamental_score * self.WEIGHTS["fundamental"]
            + sentiment_score * self.WEIGHTS["sentiment"]
            + pattern_norm * self.WEIGHTS["pattern"]
        )
        total_score = round(total_score, 1)

        # 健康等級
        if total_score >= 80:
            health_level = "excellent"
        elif total_score >= 65:
            health_level = "good"
        elif total_score >= 45:
            health_level = "fair"
        elif total_score >= 30:
            health_level = "poor"
        else:
            health_level = "critical"

        return {
            "stock_code": stock_code,
            "total_score": total_score,
            "technical_score": tech_score,
            "chip_score": chip_score,
            "fundamental_score": fundamental_score,
            "sentiment_score": sentiment_score,
            "pattern_score": round(pattern_score, 1),
            "pattern_norm": round(pattern_norm, 1),
            "recent_patterns": recent_patterns,
            "health_level": health_level,
            "weights": self.WEIGHTS,
            "analyzed_at": datetime.now().isoformat(),
        }

    async def calculate_radar_data(self, stock_code: str) -> dict:
        """
        雷達圖數據
        五角雷達圖: 價值、動能、籌碼、成長、抗跌
        """
        technical = await self.tech_service.analyze(stock_code, "medium")
        chip = await self.chip_service.analyze(stock_code, 90)

        # 取得 K 線數據計算額外指標
        cutoff_date = datetime.now() - timedelta(days=120)
        stmt = (
            select(DailyBar)
            .where(
                DailyBar.stock_code == stock_code,
                DailyBar.trade_date >= cutoff_date,
            )
            .order_by(DailyBar.trade_date)
        )
        result = await self.db.execute(stmt)
        bars = result.scalars().all()

        # 價值分數 (基於 PE/PB 相對位置，這裡用簡化版本)
        value_score = 50
        if bars:
            # 用價格相對位置作為價值代理
            closes = [b.close for b in bars if b.close]
            if len(closes) >= 60:
                current_price = closes[-1]
                avg_price = np.mean(closes)
                if current_price < avg_price * 0.9:
                    value_score = 70  # 低於均價，相對便宜
                elif current_price > avg_price * 1.1:
                    value_score = 30  # 高於均價，相對貴
                else:
                    value_score = 50

        # 動能分數 (基於技術分析)
        momentum_score = technical.get("score", 50)

        # 籌碼分數
        chip_score = chip.get("score", 50)

        # 成長分數 (基於營收成長，這裡用成交量成長作為代理)
        growth_score = 50
        if len(bars) >= 60:
            recent_volume = np.mean([b.volume or 0 for b in bars[-20:]])
            old_volume = np.mean([b.volume or 0 for b in bars[-60:-40]])
            if old_volume > 0:
                volume_growth = recent_volume / old_volume
                if volume_growth > 1.5:
                    growth_score = 80
                elif volume_growth > 1.2:
                    growth_score = 65
                elif volume_growth < 0.5:
                    growth_score = 30
                elif volume_growth < 0.8:
                    growth_score = 40
                else:
                    growth_score = 50

        # 抗跌分數 (基於下跌時的跌幅控制)
        resistance_score = 50
        if len(bars) >= 60:
            # 計算最大回撤
            peak = max(closes)
            trough = min(closes)
            if peak > 0:
                max_drawdown = (peak - trough) / peak
                if max_drawdown < 0.1:
                    resistance_score = 90
                elif max_drawdown < 0.2:
                    resistance_score = 75
                elif max_drawdown < 0.3:
                    resistance_score = 55
                elif max_drawdown < 0.5:
                    resistance_score = 35
                else:
                    resistance_score = 20

        return {
            "stock_code": stock_code,
            "radar": {
                "value": value_score,
                "momentum": momentum_score,
                "chip": chip_score,
                "growth": growth_score,
                "resistance": resistance_score,
            },
            "analyzed_at": datetime.now().isoformat(),
        }

    async def generate_signals(self, stock_code: Optional[str] = None, level: str = "all") -> list[dict]:
        """
        決策樹觸發訊號
        基於多條件規則產生操作建議
        """
        signals = []

        # 如果指定股票，只分析該股票
        if stock_code:
            score_data = await self.calculate_composite_score(stock_code)
            signal = self._evaluate_decision_tree(stock_code, score_data)
            if signal:
                signals.append(signal)
        else:
            # 掃描所有股票 (限制數量)
            stmt = select(Stock.code).limit(100)
            result = await self.db.execute(stmt)
            codes = [r[0] for r in result.all()]

            for code in codes:
                try:
                    score_data = await self.calculate_composite_score(code)
                    signal = self._evaluate_decision_tree(code, score_data)
                    if signal:
                        signals.append(signal)
                except Exception:
                    continue

        # 過濾等級
        if level != "all":
            signals = [s for s in signals if s["level"] == level]

        return signals

    def _evaluate_decision_tree(self, stock_code: str, score_data: dict) -> Optional[dict]:
        """
        決策樹評估
        基於多層條件判斷產生訊號
        """
        total = score_data["total_score"]
        tech = score_data["technical_score"]
        chip = score_data["chip_score"]
        sentiment = score_data["sentiment_score"]
        fundamental = score_data["fundamental_score"]

        # 第一層: 總分過濾
        if total >= 75:
            level = "strong"
            action = "strong_buy"
            reason = f"綜合評分 {total} 分，各項指標強勁"
        elif total >= 60:
            level = "strong"
            action = "buy"
            reason = f"綜合評分 {total} 分，具備投資價值"
        elif total <= 25:
            level = "sell"
            action = "strong_sell"
            reason = f"綜合評分 {total} 分，風險過高"
        elif total <= 40:
            level = "sell"
            action = "sell"
            reason = f"綜合評分 {total} 分，建議避開"
        else:
            # 第二層: 觀察區間，檢查個別維度
            if tech >= 70 and chip >= 70:
                level = "watch"
                action = "watch"
                reason = f"技術與籌碼強勁，等待進場時機"
            elif sentiment <= 30:
                level = "watch"
                action = "caution"
                reason = f"情緒面偏弱，建議觀望"
            else:
                return None  # 沒有明確訊號

        return {
            "stock_code": stock_code,
            "level": level,
            "action": action,
            "reason": reason,
            "scores": {
                "total": total,
                "technical": tech,
                "chip": chip,
                "sentiment": sentiment,
                "fundamental": fundamental,
            },
            "generated_at": datetime.now().isoformat(),
        }

    async def get_recommendations(self, min_score: int = 70, limit: int = 10) -> list[dict]:
        """
        每日推薦潛力股
        基於多因子評分篩選
        """
        stmt = select(Stock.code).limit(200)
        result = await self.db.execute(stmt)
        codes = [r[0] for r in result.all()]

        recommendations = []
        for code in codes:
            try:
                score_data = await self.calculate_composite_score(code)
                if score_data["total_score"] >= min_score:
                    recommendations.append(score_data)
            except Exception:
                continue

            if len(recommendations) >= limit:
                break

        # 依分數排序
        recommendations.sort(key=lambda x: x["total_score"], reverse=True)

        return recommendations
