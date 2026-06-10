"""
技術分析服務
計算 MA, RSI, MACD, KDJ, BOLL 等技術指標
"""
import logging
from datetime import date, timedelta

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

        rsi_values = [None] * period

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

        return {"macd": macd_line, "signal": signal_line, "histogram": histogram}

    def _calculate_kdj(self, bars: list[dict], period: int = 9) -> dict:
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

            rsv = (bars[i]["close"] - lowest) / (highest - lowest) * 100 if highest != lowest else 50.0
            k = (2 / 3) * k_values[-1] + (1 / 3) * rsv
            d = (2 / 3) * d_values[-1] + (1 / 3) * k
            j = 3 * k - 2 * d

            k_values.append(k)
            d_values.append(d)
            j_values.append(j)

        return {"k": k_values, "d": d_values, "j": j_values}

    def _calculate_bollinger(self, closes: list[float], period: int = 20, std_dev: float = 2.0) -> dict:
        """計算布林帶"""
        if len(closes) < period:
            return {"upper": [], "middle": [], "lower": []}

        upper, middle, lower = [], [], []
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

    async def analyze(self, stock_code: str, period: str = "medium") -> dict:
        """
        執行完整技術分析，回傳結構與前端 TechnicalAnalysis 型別一致
        """
        days_map = {"short": 60, "medium": 120, "long": 240}
        days = days_map.get(period, 120)
        bars = await self._fetch_bars(stock_code, days)

        if not bars or len(bars) < 20:
            return {
                "stock_code": stock_code,
                "period": period,
                "has_data": False,
                "score": 0,
                "signal": "中性",
                "ma_alignment": "數據不足",
                "trend": {"direction": "未知", "strength": 0.0},
                "rsi": 50.0,
                "macd": {"macd_line": 0.0, "signal_line": 0.0, "histogram": 0.0},
                "kdj": {"k": 50.0, "d": 50.0, "j": 50.0},
                "bollinger": {"upper": 0.0, "middle": 0.0, "lower": 0.0},
                "volume": {"avg_volume": 0.0, "current_volume": 0.0, "ratio": 0.0},
                "message": "數據不足，至少需要 20 根 K 線",
            }

        closes = [b["close"] for b in bars]
        volumes = [b["volume"] for b in bars]

        ma_data = self._calculate_ma(closes, [5, 10, 20, 60])
        rsi_values = self._calculate_rsi(closes)
        macd_data = self._calculate_macd(closes)
        kdj_data = self._calculate_kdj(bars)
        boll_data = self._calculate_bollinger(closes)

        # 最新指標值
        latest_rsi = next((v for v in reversed(rsi_values) if v is not None), 50.0)
        latest_macd = macd_data["macd"][-1] if macd_data["macd"] else 0.0
        latest_signal = macd_data["signal"][-1] if macd_data["signal"] else 0.0
        latest_hist = macd_data["histogram"][-1] if macd_data["histogram"] else 0.0
        latest_k = kdj_data["k"][-1] if kdj_data["k"] else 50.0
        latest_d = kdj_data["d"][-1] if kdj_data["d"] else 50.0
        latest_j = kdj_data["j"][-1] if kdj_data["j"] else 50.0

        boll_upper = next((v for v in reversed(boll_data["upper"]) if v is not None), 0.0)
        boll_middle = next((v for v in reversed(boll_data["middle"]) if v is not None), 0.0)
        boll_lower = next((v for v in reversed(boll_data["lower"]) if v is not None), 0.0)

        # 均線排列
        ma5 = (ma_data.get("MA5") or [None])[-1]
        ma10 = (ma_data.get("MA10") or [None])[-1]
        ma20 = (ma_data.get("MA20") or [None])[-1]
        ma60 = (ma_data.get("MA60") or [None])[-1]
        if ma5 and ma10 and ma20 and ma60:
            if ma5 > ma10 > ma20 > ma60:
                ma_alignment_str = "多頭排列"
            elif ma5 < ma10 < ma20 < ma60:
                ma_alignment_str = "空頭排列"
            else:
                ma_alignment_str = "盤整"
        else:
            ma_alignment_str = "數據不足"

        # 趨勢
        current_price = closes[-1]
        if ma20:
            deviation = (current_price - ma20) / ma20 * 100
            if deviation > 5:
                trend_direction = "強勢上升"
                trend_strength = min(deviation / 20, 1.0)
            elif deviation > 0:
                trend_direction = "上升"
                trend_strength = deviation / 20
            elif deviation > -5:
                trend_direction = "下降"
                trend_strength = abs(deviation) / 20
            else:
                trend_direction = "強勢下降"
                trend_strength = min(abs(deviation) / 20, 1.0)
        else:
            trend_direction = "未知"
            trend_strength = 0.0

        # 量能
        avg_vol = float(np.mean(volumes[-20:])) if len(volumes) >= 20 else float(np.mean(volumes))
        current_vol = float(volumes[-1]) if volumes else 0.0
        vol_ratio = round(current_vol / avg_vol, 2) if avg_vol > 0 else 0.0

        # 評分
        score = 50
        if ma_alignment_str == "多頭排列":
            score += 20
        elif ma_alignment_str == "空頭排列":
            score -= 20

        if "上升" in trend_direction:
            score += int(trend_strength * 15)
        elif "下降" in trend_direction:
            score -= int(trend_strength * 15)

        if 40 < latest_rsi < 60:
            score += 5
        elif latest_rsi < 30:
            score += 10
        elif latest_rsi > 70:
            score -= 10

        if latest_hist > 0:
            score += 10
        elif latest_hist < 0:
            score -= 10

        if vol_ratio > 1.5:
            score += 5

        score = max(0, min(100, score))

        # 訊號
        if score >= 80:
            signal = "強力看多"
        elif score >= 65:
            signal = "看多"
        elif score >= 50:
            signal = "中性偏多"
        elif score >= 35:
            signal = "中性偏空"
        elif score >= 20:
            signal = "看空"
        else:
            signal = "強力看空"

        return {
            "stock_code": stock_code,
            "period": period,
            "has_data": True,
            "score": score,
            "signal": signal,
            "ma_alignment": ma_alignment_str,
            "trend": {
                "direction": trend_direction,
                "strength": round(trend_strength, 3),
            },
            "rsi": round(latest_rsi, 2),
            "macd": {
                "macd_line": round(latest_macd, 4),
                "signal_line": round(latest_signal, 4),
                "histogram": round(latest_hist, 4),
            },
            "kdj": {
                "k": round(latest_k, 2),
                "d": round(latest_d, 2),
                "j": round(latest_j, 2),
            },
            "bollinger": {
                "upper": round(boll_upper, 2),
                "middle": round(boll_middle, 2),
                "lower": round(boll_lower, 2),
            },
            "volume": {
                "avg_volume": round(avg_vol, 0),
                "current_volume": round(current_vol, 0),
                "ratio": vol_ratio,
            },
            "bars_count": len(bars),
        }


def create_technical_service(db: AsyncSession) -> TechnicalService:
    return TechnicalService(db)
