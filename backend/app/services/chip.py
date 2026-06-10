"""
籌碼分析服務
- 法人買賣超動向
- 融資融劵趨勢
- 籌碼集中度分析
"""

from datetime import datetime, timedelta

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.daily_bar import ChipData


class ChipService:
    """籌碼分析服務"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _fetch_chip_data(self, stock_code: str, days: int = 90) -> list[ChipData]:
        """取得籌碼數據"""
        cutoff_date = datetime.now() - timedelta(days=days)
        stmt = (
            select(ChipData)
            .where(
                ChipData.stock_code == stock_code,
                ChipData.trade_date >= cutoff_date,  # 修正：record_date → trade_date
            )
            .order_by(desc(ChipData.trade_date))
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def analyze_dealer_flow(self, stock_code: str, days: int = 30) -> dict:
        """法人買賣超分析"""
        chip_data_list = await self._fetch_chip_data(stock_code, days)
        if not chip_data_list:
            return {
                "foreign_net_buy": 0,
                "invest_trust_net_buy": 0,
                "proprietary_net_buy": 0,
                "foreign_consecutive_days": 0,
                "invest_trust_consecutive_days": 0,
                "trend": "neutral",
                "signal": "neutral",
            }

        # 修正：使用正確的欄位名稱 foreign_net / trust_net / proprietary_net
        foreign_net = sum(float(chip.foreign_net or 0) for chip in chip_data_list)
        invest_trust_net = sum(float(chip.trust_net or 0) for chip in chip_data_list)
        proprietary_net = sum(float(chip.proprietary_net or 0) for chip in chip_data_list)

        # 連續買賣超天數 (正數=連買，負數=連賣)
        foreign_consecutive = 0
        for chip in chip_data_list:
            val = float(chip.foreign_net or 0)
            if val > 0:
                foreign_consecutive += 1
            elif val < 0:
                foreign_consecutive -= 1
            else:
                break

        invest_trust_consecutive = 0
        for chip in chip_data_list:
            val = float(chip.trust_net or 0)
            if val > 0:
                invest_trust_consecutive += 1
            elif val < 0:
                invest_trust_consecutive -= 1
            else:
                break

        if foreign_net > 100_000_000 and invest_trust_net > 50_000_000:
            trend, signal = "strong_buy", "bullish"
        elif foreign_net > 50_000_000:
            trend, signal = "buy", "bullish"
        elif foreign_net < -100_000_000 and invest_trust_net < -50_000_000:
            trend, signal = "strong_sell", "bearish"
        elif foreign_net < -50_000_000:
            trend, signal = "sell", "bearish"
        else:
            trend, signal = "neutral", "neutral"

        return {
            "foreign_net_buy": foreign_net,
            "invest_trust_net_buy": invest_trust_net,
            "proprietary_net_buy": proprietary_net,
            "foreign_consecutive_days": foreign_consecutive,
            "invest_trust_consecutive_days": invest_trust_consecutive,
            "trend": trend,
            "signal": signal,
        }

    async def analyze_margin_trading(self, stock_code: str, days: int = 30) -> dict:
        """融資融劵分析"""
        chip_data_list = await self._fetch_chip_data(stock_code, days)
        if not chip_data_list:
            return {
                "margin_balance": 0,
                "short_balance": 0,
                "margin_net_buy": 0,
                "short_net_sell": 0,
                "margin_ratio": 0,
                "margin_trend": "neutral",
                "short_trend": "neutral",
                "signal": "neutral",
            }

        latest = chip_data_list[0]
        margin_balance = float(latest.margin_balance or 0)
        # ChipData 模型目前無 short_balance 欄位，預留為 0
        short_balance = 0.0

        if len(chip_data_list) >= 10:
            recent_5_avg = np.mean([float(c.margin_balance or 0) for c in chip_data_list[:5]])
            old_5_avg = np.mean([float(c.margin_balance or 0) for c in chip_data_list[5:10]])
            margin_trend = "increasing" if recent_5_avg > old_5_avg else "decreasing"
        else:
            margin_trend = "neutral"

        # short_balance 未建模，暫時標記為 neutral
        short_trend = "neutral"

        # 修正：operator precedence bug — (a or 0) - (b or 0)
        margin_net_buy = (float(latest.margin_buy or 0)) - (float(latest.margin_sell or 0))
        margin_ratio = margin_balance / short_balance if short_balance > 0 else 0.0

        if margin_trend == "increasing":
            signal = "bullish"
        elif margin_trend == "decreasing":
            signal = "bearish"
        else:
            signal = "neutral"

        return {
            "margin_balance": margin_balance,
            "short_balance": short_balance,
            "margin_net_buy": margin_net_buy,
            "short_net_sell": 0.0,  # 暫無欄位
            "margin_ratio": margin_ratio,
            "margin_trend": margin_trend,
            "short_trend": short_trend,
            "signal": signal,
        }

    async def analyze_concentration(self, stock_code: str, days: int = 90) -> dict:
        """籌碼集中度分析（使用融資變化作為代理指標）"""
        chip_data_list = await self._fetch_chip_data(stock_code, days)
        if not chip_data_list or len(chip_data_list) < 20:
            return {
                "concentration_ratio": 0.5,
                "large_holder_trend": "neutral",
                "retail_ratio": 0.5,
                "signal": "neutral",
            }

        # 用融資餘額變化代理籌碼集中度（待日後接入 TDCC 集保大戶資料）
        recent_avg = np.mean([float(c.margin_balance or 0) for c in chip_data_list[:10]])
        old_avg = np.mean([float(c.margin_balance or 0) for c in chip_data_list[20:30]])

        concentration_ratio = (recent_avg / old_avg) if old_avg > 0 else 1.0
        # 正規化到 0-1 範圍
        concentration_ratio = min(max(concentration_ratio / 2, 0.0), 1.0)

        if concentration_ratio > 0.65:
            large_holder_trend, signal = "accumulating", "bullish"
        elif concentration_ratio < 0.35:
            large_holder_trend, signal = "distributing", "bearish"
        else:
            large_holder_trend, signal = "stable", "neutral"

        return {
            "concentration_ratio": round(concentration_ratio, 4),
            "large_holder_trend": large_holder_trend,
            "retail_ratio": round(1 - concentration_ratio, 4),
            "signal": signal,
        }

    async def analyze(self, stock_code: str, days: int = 90) -> dict:
        """完整籌碼分析"""
        dealer_flow = await self.analyze_dealer_flow(stock_code, days)
        margin_trading = await self.analyze_margin_trading(stock_code, days)
        concentration = await self.analyze_concentration(stock_code, days)

        score = 50
        if dealer_flow["signal"] == "bullish":
            score += 15
        elif dealer_flow["signal"] == "bearish":
            score -= 15

        if margin_trading["signal"] == "bullish":
            score += 10
        elif margin_trading["signal"] == "bearish":
            score -= 10

        if concentration["signal"] == "bullish":
            score += 10
        elif concentration["signal"] == "bearish":
            score -= 10

        score = max(0, min(100, score))

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
            "dealer_flow": dealer_flow,
            "margin_trading": margin_trading,
            "concentration": concentration,
            "analyzed_at": datetime.now().isoformat(),
        }
