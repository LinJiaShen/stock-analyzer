"""
技術分析服務
計算 MA, RSI, MACD, KDJ, BOLL 等技術指標
"""
import logging
from datetime import date, timedelta
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_bar import DailyBar

logger = logging.getLogger(__name__)


class TechnicalService:
    """技術分析計算服務"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _fetch_bars(self, stock_code: str, days: int = 120) -> list[dict]:
        """取得 K 線數據"""
        start_date = date.today() - timedelta(days=days)
        query = (
            select(DailyBar)
            .where(
                DailyBar.stock_code == stock_code,
                DailyBar.trade_date >= start_date,
            )
            .order_by(DailyBar.trade_date)
        )
        result = await self.db.execute(query)
        bars = result.scalars().all()

        return [
            {
                "date": bar.trade_date,
                "open": float(bar.open_price) if bar.open_price else 0,
                "high": float(bar.high_price) if bar.high_price else 0,
                "low": float(bar.low_price) if bar.low_price else 0,
                "close": float(bar.close_price) if bar.close_price else 0,
                "volume": float(bar.volume) if bar.volume else 0,
            }
            for bar in bars
        ]

    def _calculate_ma(self, closes: list[float], periods: list[int]) -> dict:
        """計算多週期移動平均線"""
        result = {}
        n = len(closes)
        for period in periods:
            if n >= period:
                ma_values = []
                for i in range(n):
                    if i < period - 1:
                        ma_values.append(None)
                    else:
                        ma_values.append(np.mean(closes[i - period + 1: i + 1]))
                result[f"MA{period}"] = ma_values
        return result

    def _calculate_rsi(self, closes: list[float], period: int = 14) -> list[float]:
        """計算 RSI"""
        if len(closes) < period + 1:
            return [None] * len(closes)

        deltas = np.diff(closes)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])

        rsi_values = [None] * (period)  # First 'period' values are None

        rs = avg_gain / (avg_loss if avg_loss != 0 else 0.0001)
        rsi_values.append(100 - (100 / (1 + rs)))

        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            rs = avg_gain / (avg_loss if avg_loss != 0 else 0.0001)
            rsi_values.append(100 - (100 / (1 + rs)))

        return rsi_values

    def _calculate_macd(
        self, closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9
    ) -> dict:
        """計算 MACD"""
        if len(closes) < slow:
            return {"macd": [], "signal": [], "histogram": []}

        closes_arr = np.array(closes)

        # EMA 計算
        def ema(data, period):
            multiplier = 2 / (period + 1)
            result = [data[0]]
            for i in range(1, len(data)):
                result.append(data[i] * multiplier + result[-1] * (1 - multiplier))
            return result

        ema_fast = ema(closes, fast)
        ema_slow = ema(closes, slow)

        macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
        signal_line = ema(macd_line, signal)
        histogram = [m - s for m, s in zip(macd_line, signal_line)]

        return {
            "macd": macd_line,
            "signal": signal_line,
            "histogram": histogram,
        }

    def _calculate_kdj(
        self, bars: list[dict], period: int = 9
    ) -> dict:
        """計算 KDJ"""
        if len(bars) < period:
            return {"k": [], "d": [], "j": []}

        k_values = [50.0]
        d_values = [50.0]
        j_values = [50.0]

        for i in range(period - 1, len(bars)):
            window = bars[i - period + 1: i + 1]
            lowest = min(b["low"] for b in window)
            highest = max(b["high"] for b in window)

            if highest == lowest:
                rsv = 50.0
            else:
                rsv = (bars[i]["close"] - lowest) / (highest - lowest) * 100

            k = (2 / 3) * k_values[-1] + (1 / 3) * rsv
            d = (2 / 3) * d_values[-1] + (1 / 3) * k
            j = 3 * k - 2 * d

            k_values.append(k)
            d_values.append(d)
            j_values.append(j)

        return {"k": k_values, "d": d_values, "j": j_values}

    def _calculate_bollinger(
        self, closes: list[float], period: int = 20, std_dev: float = 2.0
    ) -> dict:
        """計算布林帶"""
        if len(closes) < period:
            return {"upper": [], "middle": [], "lower": []}

        upper = []
        middle = []
        lower = []

        for i in range(len(closes)):
            if i < period - 1:
                upper.append(None)
                middle.append(None)
                lower.append(None)
            else:
                window = closes[i - period + 1: i + 1]
                mid = np.mean(window)
                std = np.std(window)
                upper.append(mid + std_dev * std)
                middle.append(mid)
                lower.append(mid - std_dev * std)

        return {"upper": upper, "middle": middle, "lower": lower}

    def _analyze_ma_alignment(self, ma_data: dict, closes: list[float]) -> dict:
        """分析均線排列"""
        if not closes or len(closes) < 26:
            return {"alignment": "unknown", "details": {}}

        latest = len(closes) - 1
        ma5 = ma_data.get("MA5", [None])[-1]
        ma10 = ma_data.get("MA10", [None])[-1]
        ma20 = ma_data.get("MA20", [None])[-1]
        ma60 = ma_data.get("MA60", [None])[-1]

        valid_mas = [m for m in [ma5, ma10, ma20, ma60] if m is not None]

        if len(valid_mas) < 3:
            return {"alignment": "insufficient_data", "details": {}}

        # 多頭排列: MA5 > MA10 > MA20 > MA60
        if ma5 and ma10 and ma20 and ma60:
            if ma5 > ma10 > ma20 > ma60:
                alignment = "bullish"
            elif ma5 < ma10 < ma20 < ma60:
                alignment = "bearish"
            else:
                alignment = "mixed"
        else:
            alignment = "mixed"

        return {
            "alignment": alignment,
            "details": {
                "MA5": round(ma5, 2) if ma5 else None,
                "MA10": round(ma10, 2) if ma10 else None,
                "MA20": round(ma20, 2) if ma20 else None,
                "MA60": round(ma60, 2) if ma60 else None,
            },
        }

    def _analyze_trend(self, closes: list[float], ma_data: dict) -> dict:
        """趨勢分析"""
        if len(closes) < 20:
            return {"direction": "unknown", "strength": 0}

        ma20 = ma_data.get("MA20", [None])[-1]
        current = closes[-1]

        if ma20 is None:
            return {"direction": "unknown", "strength": 0}

        # 價格相對於 MA20 的位置
        deviation = (current - ma20) / ma20 * 100

        if deviation > 5:
            direction = "strong_up"
            strength = min(int(deviation), 100)
        elif deviation > 0:
            direction = "up"
            strength = int(deviation * 10)
        elif deviation > -5:
            direction = "down"
            strength = int(abs(deviation) * 10)
        else:
            direction = "strong_down"
            strength = min(int(abs(deviation)), 100)

        return {"direction": direction, "strength": strength}

    def _analyze_volume(self, bars: list[dict]) -> dict:
        """量能分析"""
        if len(bars) < 20:
            return {"trend": "unknown", "ratio": 0}

        volumes = [b["volume"] for b in bars]
        recent_avg = np.mean(volumes[-5:])
        period_avg = np.mean(volumes[-20:])

        if period_avg == 0:
            return {"trend": "unknown", "ratio": 0}

        ratio = recent_avg / period_avg

        if ratio > 1.5:
            trend = "increasing"
        elif ratio > 1.0:
            trend = "slightly_increasing"
        elif ratio > 0.5:
            trend = "slightly_decreasing"
        else:
            trend = "decreasing"

        return {"trend": trend, "ratio": round(ratio, 2)}

    async def analyze(
        self, stock_code: str, period: str = "medium"
    ) -> dict:
        """
        執行完整技術分析

        Args:
            stock_code: 股票代碼
            period: 分析週期 (short=20天, medium=60天, long=120天)

        Returns:
            技術分析結果
        """
        days_map = {"short": 60, "medium": 120, "long": 240}
        days = days_map.get(period, 120)

        bars = await self._fetch_bars(stock_code, days)

        if not bars or len(bars) < 20:
            return {
                "stock_code": stock_code,
                "period": period,
                "has_data": False,
                "message": "數據不足，至少需要 20 根 K 線",
            }

        closes = [b["close"] for b in bars]

        # 計算所有指標
        ma_data = self._calculate_ma(closes, [5, 10, 20, 60])
        rsi_values = self._calculate_rsi(closes)
        macd_data = self._calculate_macd(closes)
        kdj_data = self._calculate_kdj(bars)
        boll_data = self._calculate_bollinger(closes)

        # 分析
        ma_alignment = self._analyze_ma_alignment(ma_data, closes)
        trend = self._analyze_trend(closes, ma_data)
        volume = self._analyze_volume(bars)

        # 最新指標值
        latest_rsi = rsi_values[-1] if rsi_values and rsi_values[-1] else None
        latest_macd = macd_data["macd"][-1] if macd_data["macd"] else None
        latest_signal = macd_data["signal"][-1] if macd_data["signal"] else None
        latest_hist = macd_data["histogram"][-1] if macd_data["histogram"] else None
        latest_k = kdj_data["k"][-1] if kdj_data["k"] else None
        latest_d = kdj_data["d"][-1] if kdj_data["d"] else None
        latest_j = kdj_data["j"][-1] if kdj_data["j"] else None

        # 評分 (0-100)
        score = 50  # 基準分

        # MA 排列加分
        if ma_alignment["alignment"] == "bullish":
            score += 20
        elif ma_alignment["alignment"] == "bearish":
            score -= 20

        # 趨勢加分
        if trend["direction"] in ("up", "strong_up"):
            score += min(trend["strength"] // 5, 15)
        elif trend["direction"] in ("down", "strong_down"):
            score -= min(trend["strength"] // 5, 15)

        # RSI 加分
        if latest_rsi:
            if 40 < latest_rsi < 60:
                score += 5  # 中性區
            elif latest_rsi < 30:
                score += 10  # 超賣反彈機會
            elif latest_rsi > 70:
                score -= 10  # 超買風險

        # MACD 加分
        if latest_hist and latest_hist > 0:
            score += 10
        elif latest_hist and latest_hist < 0:
            score -= 10

        # 量能加分
        if volume["trend"] == "increasing":
            score += 10
        elif volume["trend"] == "decreasing":
            score -= 5

        score = max(0, min(100, score))

        return {
            "stock_code": stock_code,
            "period": period,
            "has_data": True,
            "score": score,
            "ma_alignment": ma_alignment,
            "trend": trend,
            "volume": volume,
            "indicators": {
                "rsi": round(latest_rsi, 2) if latest_rsi else None,
                "macd": round(latest_macd, 4) if latest_macd else None,
                "macd_signal": round(latest_signal, 4) if latest_signal else None,
                "macd_histogram": round(latest_hist, 4) if latest_hist else None,
                "kdj_k": round(latest_k, 2) if latest_k else None,
                "kdj_d": round(latest_d, 2) if latest_d else None,
                "kdj_j": round(latest_j, 2) if latest_j else None,
            },
            "bollinger": {
                "upper": round(boll_data["upper"][-1], 2) if boll_data["upper"][-1] else None,
                "middle": round(boll_data["middle"][-1], 2) if boll_data["middle"][-1] else None,
                "lower": round(boll_data["lower"][-1], 2) if boll_data["lower"][-1] else None,
            },
            "bars_count": len(bars),
        }


def create_technical_service(db: AsyncSession) -> TechnicalService:
    """建立技術分析服務實例"""
    return TechnicalService(db)
