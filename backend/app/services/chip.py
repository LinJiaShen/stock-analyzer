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

        # 細緻化分析：常態 vs 異常、近期轉折、與區間均值對比
        anomaly = self._foreign_anomaly(chip_data_list)

        return {
            "foreign_net_buy": foreign_net,
            "invest_trust_net_buy": invest_trust_net,
            "proprietary_net_buy": proprietary_net,
            "foreign_consecutive_days": foreign_consecutive,
            "invest_trust_consecutive_days": invest_trust_consecutive,
            "trend": trend,
            "signal": signal,
            "anomaly": anomaly,
        }

    def _foreign_anomaly(self, chip_data_list: list[ChipData]) -> dict:
        """
        外資動向細緻化：判斷目前是「常態」還是「異常」。

        - 量能異常：最新一日外資淨額相對區間分布的 z 分數（|z|≥2 視為異常）
        - 近期轉折：近 5 日 vs 前 5 日淨額方向是否反轉（由買轉賣 / 由賣轉買）
        - 連續天數異常：目前連續同向天數是否為區間內最長且 ≥ 5 天
        - 與均值對比：最新一日 vs 區間日均
        """
        series = [float(c.foreign_net or 0) for c in chip_data_list]  # 新→舊
        if len(series) < 10:
            return {"enough_data": False}

        daily_avg = float(np.mean(series))
        std = float(np.std(series))
        latest = series[0]
        z = round((latest - daily_avg) / std, 1) if std > 0 else 0.0

        recent_5d = sum(series[:5])
        prior_5d = sum(series[5:10])
        if recent_5d > 0 and prior_5d < 0:
            turning = "由賣轉買"
        elif recent_5d < 0 and prior_5d > 0:
            turning = "由買轉賣"
        elif recent_5d > 0:
            turning = "延續買超"
        elif recent_5d < 0:
            turning = "延續賣超"
        else:
            turning = "持平"

        # 目前連續同向天數（乾淨計算：遇到反向或 0 即停）
        cur_streak = 0
        sign0 = 0
        for v in series:
            s = 1 if v > 0 else -1 if v < 0 else 0
            if s == 0:
                break
            if sign0 == 0:
                sign0 = s
            if s == sign0:
                cur_streak += 1
            else:
                break

        # 區間內最長連續同向天數
        max_streak = 0
        run = 0
        prev = 0
        for v in reversed(series):  # 舊→新
            s = 1 if v > 0 else -1 if v < 0 else 0
            if s != 0 and s == prev:
                run += 1
            elif s != 0:
                run = 1
                prev = s
            else:
                run = 0
                prev = 0
            max_streak = max(max_streak, run)

        streak_abnormal = cur_streak >= 5 and cur_streak >= max_streak

        return {
            "enough_data": True,
            "foreign_daily_avg": round(daily_avg),
            "foreign_latest": round(latest),
            "zscore": z,
            "volume_abnormal": abs(z) >= 2,
            "recent_5d_net": round(recent_5d),
            "prior_5d_net": round(prior_5d),
            "turning": turning,
            "current_streak": cur_streak * (sign0 or 0),
            "max_streak_in_window": max_streak,
            "streak_abnormal": streak_abnormal,
            "window_days": len(series),
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
