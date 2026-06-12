"""
籌碼分析服務
- 法人買賣超動向
- 融資融劵趨勢
- 籌碼集中度分析
"""

from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
import numpy as np

from app.models.daily_bar import ChipData


class ChipService:
    """籌碼分析服務"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _fetch_chip_data(self, stock_code: str, days: int = 90) -> list[ChipData]:
        """取得籌碼數據"""
        cutoff_date = (datetime.now() - timedelta(days=days)).date()
        stmt = (
            select(ChipData)
            .where(
                ChipData.stock_code == stock_code,
                ChipData.trade_date >= cutoff_date,
            )
            .order_by(desc(ChipData.trade_date))
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def analyze_dealer_flow(self, stock_code: str, days: int = 30) -> dict:
        """
        法人買賣超分析
        - 連續買賣超天數
        - 買賣超金額趨勢
        - 外資/投信/自營部個別動向
        """
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

        # 計算最近 N 天的加總（ChipData 欄位：foreign_net, trust_net, proprietary_net）
        foreign_net = sum([float(chip.foreign_net or 0) for chip in chip_data_list])
        invest_trust_net = sum([float(chip.trust_net or 0) for chip in chip_data_list])
        proprietary_net = sum([float(chip.proprietary_net or 0) for chip in chip_data_list])

        # 計算連續買賣超天數
        foreign_consecutive = 0
        for chip in chip_data_list:
            if chip.foreign_net and float(chip.foreign_net) > 0:
                foreign_consecutive += 1
            elif chip.foreign_net and float(chip.foreign_net) < 0:
                foreign_consecutive -= 1
            else:
                break

        invest_trust_consecutive = 0
        for chip in chip_data_list:
            if chip.trust_net and float(chip.trust_net) > 0:
                invest_trust_consecutive += 1
            elif chip.trust_net and float(chip.trust_net) < 0:
                invest_trust_consecutive -= 1
            else:
                break

        # 判斷趨勢
        if foreign_net > 100000000 and invest_trust_net > 50000000:
            trend = "strong_buy"
            signal = "bullish"
        elif foreign_net > 50000000:
            trend = "buy"
            signal = "bullish"
        elif foreign_net < -100000000 and invest_trust_net < -50000000:
            trend = "strong_sell"
            signal = "bearish"
        elif foreign_net < -50000000:
            trend = "sell"
            signal = "bearish"
        else:
            trend = "neutral"
            signal = "neutral"

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
        """
        融資分析
        - 融資餘額趨勢
        - 融資淨買進/淨賣出
        """
        chip_data_list = await self._fetch_chip_data(stock_code, days)
        if not chip_data_list:
            return {
                "margin_balance": 0,
                "margin_net_buy": 0,
                "margin_trend": "neutral",
                "signal": "neutral",
            }

        latest = chip_data_list[0]
        margin_balance = float(latest.margin_balance or 0)

        # 融資餘額趨勢
        if len(chip_data_list) >= 10:
            recent_5_avg = np.mean([float(c.margin_balance or 0) for c in chip_data_list[:5]])
            old_5_avg = np.mean([float(c.margin_balance or 0) for c in chip_data_list[5:10]])
            margin_trend = "increasing" if recent_5_avg > old_5_avg else "decreasing"
        else:
            margin_trend = "neutral"

        # 融資增加通常是散戶追高（偏空訊號）
        if margin_trend == "increasing" and margin_balance > 0:
            signal = "bearish"
        elif margin_trend == "decreasing":
            signal = "neutral"
        else:
            signal = "neutral"

        margin_net_buy = (float(latest.margin_buy or 0)) - (float(latest.margin_sell or 0))

        return {
            "margin_balance": margin_balance,
            "margin_net_buy": margin_net_buy,
            "margin_trend": margin_trend,
            "signal": signal,
        }

    async def analyze_concentration(self, stock_code: str, days: int = 90) -> dict:
        """
        籌碼集中度分析
        - 法人合計動向作為大戶代理指標
        - 籌碼集中度估算
        """
        chip_data_list = await self._fetch_chip_data(stock_code, days)
        if not chip_data_list or len(chip_data_list) < 20:
            return {
                "concentration_ratio": 0,
                "large_holder_trend": "neutral",
                "retail_ratio": 0,
                "signal": "neutral",
            }

        # 以法人（外資 + 投信）合計淨買進作為大戶動向代理指標
        recent_institutional = sum(
            float(chip.foreign_net or 0) + float(chip.trust_net or 0)
            for chip in chip_data_list[:10]
        )
        older_institutional = sum(
            float(chip.foreign_net or 0) + float(chip.trust_net or 0)
            for chip in chip_data_list[20:30]
        ) if len(chip_data_list) >= 30 else 0

        if recent_institutional > 0 and recent_institutional > older_institutional:
            large_holder_trend = "accumulating"
            signal = "bullish"
            concentration_ratio = 1.3
        elif recent_institutional < 0:
            large_holder_trend = "distributing"
            signal = "bearish"
            concentration_ratio = 0.7
        else:
            large_holder_trend = "stable"
            signal = "neutral"
            concentration_ratio = 1.0

        return {
            "concentration_ratio": concentration_ratio,
            "large_holder_trend": large_holder_trend,
            "retail_ratio": 1 / (concentration_ratio + 1),
            "signal": signal,
        }

    async def analyze(self, stock_code: str, days: int = 90) -> dict:
        """
        完整籌碼分析
        回傳包含所有子分析的綜合結果
        """
        dealer_flow = await self.analyze_dealer_flow(stock_code, days)
        margin_trading = await self.analyze_margin_trading(stock_code, days)
        concentration = await self.analyze_concentration(stock_code, days)

        # 綜合評分
        score = 50  # 基準分

        # 法人動向加減分
        if dealer_flow["signal"] == "bullish":
            score += 15
        elif dealer_flow["signal"] == "bearish":
            score -= 15

        # 融資融券加減分
        if margin_trading["signal"] == "bullish":
            score += 10
        elif margin_trading["signal"] == "bearish":
            score -= 10

        # 籌碼集中度加減分
        if concentration["signal"] == "bullish":
            score += 10
        elif concentration["signal"] == "bearish":
            score -= 10

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
            "dealer_flow": dealer_flow,
            "margin_trading": margin_trading,
            "concentration": concentration,
            "analyzed_at": datetime.now().isoformat(),
        }
