"""
K 線形態辨識服務
使用 Pandas 向量化運算實作各種 K 線形態偵測
"""
import logging
from typing import List, Dict, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class PatternService:
    """K 線形態辨識服務"""

    # 形態強度權重（用於決策樹評分）
    PATTERN_WEIGHTS: Dict[str, int] = {
        "marubozu_bull": 8,
        "marubozu_bear": -8,
        "inverted_hammer": 5,
        "gravestone": -5,
        "hammer": 5,
        "hanging_man": -5,
        "spinning_top": 0,
        "doji": 3,  # 可正可負，視趨勢而定
        "doji_four_price": 0,
        "bullish_engulfing": 10,
        "bearish_engulfing": -10,
        "morning_star": 12,
        "evening_star": -12,
        "bullish_island": 15,
        "bearish_island": -15,
    }

    # 形態中文名稱
    PATTERN_NAMES: Dict[str, str] = {
        "marubozu_bull": "大紅K",
        "marubozu_bear": "大黑K",
        "inverted_hammer": "倒鎚線",
        "gravestone": "墓碑線",
        "hammer": "鎚子線",
        "hanging_man": "吊人線",
        "spinning_top": "紡錘線",
        "doji": "十字線",
        "doji_four_price": "一字線",
        "bullish_engulfing": "多頭吞噬",
        "bearish_engulfing": "空頭吞噬",
        "morning_star": "晨星",
        "evening_star": "夜星",
        "bullish_island": "多頭孤島反轉",
        "bearish_island": "空頭孤島反轉",
    }

    def detect_all(self, bars: List[Dict]) -> List[Dict]:
        """
        偵測所有形態訊號

        Args:
            bars: K 線數據列表，每筆包含 {date, open, high, low, close, volume}

        Returns:
            形態訊號列表，每筆包含 {pattern, name, direction, strength, date, index}
        """
        if len(bars) < 20:
            logger.warning(f"K 線數據不足 ({len(bars)} 筆)，無法偵測形態")
            return []

        # 轉換為 pandas DataFrame 進行向量化運算
        df = pd.DataFrame(bars)

        # 計算基礎指標
        df["body"] = (df["close"] - df["open"]).abs()
        df["upper_shadow"] = df["high"] - df[["open", "close"]].max(axis=1)
        df["lower_shadow"] = df[["open", "close"]].min(axis=1) - df["low"]
        df["total_range"] = df["high"] - df["low"]
        df["is_bull"] = df["close"] > df["open"]
        df["atr_20"] = self._calculate_atr(df, 20)

        # 執行形態偵測
        patterns: List[Dict] = []
        patterns.extend(self._detect_marubozu(df))
        patterns.extend(self._detect_hammer_family(df))
        patterns.extend(self._detect_doji(df))
        patterns.extend(self._detect_spinning_top(df))
        patterns.extend(self._detect_engulfing(df))
        patterns.extend(self._detect_star_patterns(df))
        patterns.extend(self._detect_island_reversal(df))

        # 按 index 排序
        patterns.sort(key=lambda x: x["index"])

        logger.info(f"偵測到 {len(patterns)} 個 K 線形態訊號")
        return patterns

    def _calculate_atr(self, df: pd.DataFrame, period: int = 20) -> pd.Series:
        """計算 ATR (Average True Range)"""
        high_low = df["high"] - df["low"]
        high_close = (df["high"] - df["close"].shift(1)).abs()
        low_close = (df["low"] - df["close"].shift(1)).abs()

        true_range = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        atr = true_range.rolling(window=period).mean()

        return atr

    def _get_trend(self, df: pd.DataFrame, idx: int, lookback: int = 10) -> str:
        """判斷短期趨勢方向"""
        if idx < lookback:
            return "unknown"

        recent_closes = df["close"].iloc[idx - lookback : idx]
        if len(recent_closes) < 2:
            return "unknown"

        first = recent_closes.iloc[0]
        last = recent_closes.iloc[-1]

        if first == 0:
            return "flat"

        change = (last - first) / first

        if change > 0.02:
            return "up"
        elif change < -0.02:
            return "down"
        return "flat"

    def _detect_marubozu(self, df: pd.DataFrame) -> List[Dict]:
        """偵測大紅 K/大黑 K (Marubozu)"""
        patterns = []

        # 向量化判斷
        large_body = df["body"] > df["atr_20"] * 1.5
        small_shadow = (df["upper_shadow"] + df["lower_shadow"]) < df["body"] * 0.1

        marubozu_mask = large_body & small_shadow & (df["body"] > 0)

        for idx in df.index:
            if marubozu_mask[idx]:
                is_bull = df["is_bull"].iloc[idx]
                pattern_type = "marubozu_bull" if is_bull else "marubozu_bear"
                weight = self.PATTERN_WEIGHTS[pattern_type]

                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "bull" if is_bull else "bear",
                        "strength": abs(weight),
                        "date": str(df["date"].iloc[idx]),
                        "index": int(idx),
                    }
                )

        return patterns

    def _detect_hammer_family(self, df: pd.DataFrame) -> List[Dict]:
        """偵測鎚子線/倒鎚線/吊人線/墓碑線"""
        patterns = []

        # 長上影線形態 (倒鎚線/墓碑線)
        long_upper = df["upper_shadow"] > df["body"] * 2
        short_lower = df["lower_shadow"] < df["body"] * 0.5
        upper_shadow_pattern = long_upper & short_lower & (df["body"] > 0)

        # 長下影線形態 (鎚子線/吊人線)
        long_lower = df["lower_shadow"] > df["body"] * 2
        short_upper = df["upper_shadow"] < df["body"] * 0.5
        lower_shadow_pattern = long_lower & short_upper & (df["body"] > 0)

        for idx in df.index:
            if upper_shadow_pattern[idx]:
                trend = self._get_trend(df, idx, lookback=10)
                if trend == "down":
                    pattern_type = "inverted_hammer"
                    patterns.append(
                        {
                            "pattern": pattern_type,
                            "name": self.PATTERN_NAMES[pattern_type],
                            "direction": "bull",
                            "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                            "date": str(df["date"].iloc[idx]),
                            "index": int(idx),
                        }
                    )
                elif trend == "up":
                    pattern_type = "gravestone"
                    patterns.append(
                        {
                            "pattern": pattern_type,
                            "name": self.PATTERN_NAMES[pattern_type],
                            "direction": "bear",
                            "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                            "date": str(df["date"].iloc[idx]),
                            "index": int(idx),
                        }
                    )

            if lower_shadow_pattern[idx]:
                trend = self._get_trend(df, idx, lookback=10)
                if trend == "down":
                    pattern_type = "hammer"
                    patterns.append(
                        {
                            "pattern": pattern_type,
                            "name": self.PATTERN_NAMES[pattern_type],
                            "direction": "bull",
                            "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                            "date": str(df["date"].iloc[idx]),
                            "index": int(idx),
                        }
                    )
                elif trend == "up":
                    pattern_type = "hanging_man"
                    patterns.append(
                        {
                            "pattern": pattern_type,
                            "name": self.PATTERN_NAMES[pattern_type],
                            "direction": "bear",
                            "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                            "date": str(df["date"].iloc[idx]),
                            "index": int(idx),
                        }
                    )

        return patterns

    def _detect_doji(self, df: pd.DataFrame) -> List[Dict]:
        """偵測十字線 (Doji) 和一字線 (Four-Price Doji)"""
        patterns = []

        # 一字線: High == Low == Open == Close
        four_price_mask = (
            (df["high"] == df["low"])
            & (df["open"] == df["close"])
            & (df["high"] == df["open"])
        )

        # 十字線: Body <= Total Range * 0.05
        doji_mask = (df["body"] <= df["total_range"] * 0.05) & (df["total_range"] > 0)

        for idx in df.index:
            if four_price_mask[idx]:
                pattern_type = "doji_four_price"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "neutral",
                        "strength": 0,
                        "date": str(df["date"].iloc[idx]),
                        "index": int(idx),
                    }
                )
            elif doji_mask[idx]:
                trend = self._get_trend(df, idx, lookback=10)
                pattern_type = "doji"
                direction = "neutral"

                # 十字線在趨勢末端可能有反轉意義
                if trend == "down":
                    direction = "bull"
                elif trend == "up":
                    direction = "bear"

                weight = self.PATTERN_WEIGHTS[pattern_type]
                if direction == "bear":
                    weight = -abs(weight)

                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": direction,
                        "strength": abs(weight),
                        "date": str(df["date"].iloc[idx]),
                        "index": int(idx),
                    }
                )

        return patterns

    def _detect_spinning_top(self, df: pd.DataFrame) -> List[Dict]:
        """偵測紡錘線 (Spinning Top)"""
        patterns = []

        # 紡錘線: Body < ATR_20 * 0.5 AND Upper + Lower Shadow > Body * 2
        small_body = df["body"] < df["atr_20"] * 0.5
        long_shadows = (df["upper_shadow"] + df["lower_shadow"]) > df["body"] * 2

        spinning_mask = small_body & long_shadows & (df["body"] > 0)

        for idx in df.index:
            if spinning_mask[idx]:
                pattern_type = "spinning_top"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "neutral",
                        "strength": 0,
                        "date": str(df["date"].iloc[idx]),
                        "index": int(idx),
                    }
                )

        return patterns

    def _detect_engulfing(self, df: pd.DataFrame) -> List[Dict]:
        """偵測吞噬型態 (Engulfing)"""
        patterns = []

        for i in range(1, len(df)):
            prev = df.iloc[i - 1]
            curr = df.iloc[i]

            # 多頭吞噬: 前黑後紅，且今日實體完全吞噬昨日實體
            if (
                prev["close"] < prev["open"]  # 昨日黑K
                and curr["close"] > curr["open"]  # 今日紅K
                and curr["open"] <= prev["close"]  # 今日開盤 <= 昨日收盤
                and curr["close"] >= prev["open"]  # 今日收盤 >= 昨日開盤
            ):
                pattern_type = "bullish_engulfing"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "bull",
                        "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                        "date": str(df["date"].iloc[i]),
                        "index": int(i),
                    }
                )

            # 空頭吞噬: 前紅後黑，且今日實體完全吞噬昨日實體
            elif (
                prev["close"] > prev["open"]  # 昨日紅K
                and curr["close"] < curr["open"]  # 今日黑K
                and curr["open"] >= prev["close"]  # 今日開盤 >= 昨日收盤
                and curr["close"] <= prev["open"]  # 今日收盤 <= 昨日開盤
            ):
                pattern_type = "bearish_engulfing"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "bear",
                        "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                        "date": str(df["date"].iloc[i]),
                        "index": int(i),
                    }
                )

        return patterns

    def _detect_star_patterns(self, df: pd.DataFrame) -> List[Dict]:
        """偵測晨星/夜星 (Morning/Evening Star)"""
        patterns = []

        for i in range(2, len(df)):
            d1 = df.iloc[i - 2]  # Day 1
            d2 = df.iloc[i - 1]  # Day 2
            d3 = df.iloc[i]  # Day 3

            # 晨星: 大黑K -> 小實體 -> 大紅K
            if (
                d1["close"] < d1["open"]  # Day1 黑K
                and d1["body"] > df["atr_20"].iloc[i] * 1.0  # Day1 大實體
                and d2["body"] < d1["body"] * 0.5  # Day2 小實體
                and d3["close"] > d3["open"]  # Day3 紅K
                and d3["body"] > d1["body"] * 0.7  # Day3 大實體
                and d3["close"] > d1["close"] * 1.02  # Day3 收盤明顯高於 Day1
            ):
                pattern_type = "morning_star"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "bull",
                        "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                        "date": str(df["date"].iloc[i]),
                        "index": int(i),
                    }
                )

            # 夜星: 大紅K -> 小實體 -> 大黑K
            elif (
                d1["close"] > d1["open"]  # Day1 紅K
                and d1["body"] > df["atr_20"].iloc[i] * 1.0  # Day1 大實體
                and d2["body"] < d1["body"] * 0.5  # Day2 小實體
                and d3["close"] < d3["open"]  # Day3 黑K
                and d3["body"] > d1["body"] * 0.7  # Day3 大實體
                and d3["close"] < d1["close"] * 0.98  # Day3 收盤明顯低於 Day1
            ):
                pattern_type = "evening_star"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "bear",
                        "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                        "date": str(df["date"].iloc[i]),
                        "index": int(i),
                    }
                )

        return patterns

    def _detect_island_reversal(self, df: pd.DataFrame) -> List[Dict]:
        """偵測孤島反轉 (Island Reversal)"""
        patterns = []

        # 需要至少 5 根 K 線來偵測
        for i in range(2, len(df) - 2):
            prev_close = df["close"].iloc[i - 1]
            curr_open = df["open"].iloc[i]
            curr_close = df["close"].iloc[i]
            next_open = df["open"].iloc[i + 1]

            # 計算平均實體作為缺口閾值
            avg_body = df["body"].iloc[max(0, i - 5) : i + 1].mean()
            gap_threshold = avg_body * 0.5

            # 向上跳空缺口 (多頭孤島)
            if (
                curr_open > prev_close + gap_threshold  # Day(N+1) 向上跳空
                and next_open > curr_close  # Day(N+2) 持續高於缺口
                and self._get_trend(df, i - 1, lookback=10) == "down"  # 之前是下跌趨勢
            ):
                pattern_type = "bullish_island"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "bull",
                        "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                        "date": str(df["date"].iloc[i]),
                        "index": int(i),
                    }
                )

            # 向下跳空缺口 (空頭孤島)
            elif (
                curr_open < prev_close - gap_threshold  # Day(N+1) 向下跳空
                and next_open < curr_close  # Day(N+2) 持續低於缺口
                and self._get_trend(df, i - 1, lookback=10) == "up"  # 之前是上漲趨勢
            ):
                pattern_type = "bearish_island"
                patterns.append(
                    {
                        "pattern": pattern_type,
                        "name": self.PATTERN_NAMES[pattern_type],
                        "direction": "bear",
                        "strength": abs(self.PATTERN_WEIGHTS[pattern_type]),
                        "date": str(df["date"].iloc[i]),
                        "index": int(i),
                    }
                )

        return patterns

    def get_pattern_score(
        self, patterns: List[Dict], lookback: int = 5
    ) -> int:
        """
        計算近期形態評分（用於決策樹）

        Args:
            patterns: 形態訊號列表
            lookback: 回看最近 N 個形態

        Returns:
            形態評分（-100 ~ +100）
        """
        if not patterns:
            return 0

        # 只取最近的形態訊號
        recent = sorted(patterns, key=lambda x: x["index"], reverse=True)[:lookback]

        score = sum(
            p["strength"] if p["direction"] == "bull" else -p["strength"]
            for p in recent
        )

        return max(-100, min(100, score))

    def get_recent_patterns(
        self, patterns: List[Dict], max_index: int, lookback: int = 10
    ) -> List[Dict]:
        """
        取得最近 N 根 K 線內的形態（用於前端標註）

        Args:
            patterns: 所有形態訊號列表
            max_index: 最後一根 K 線的 index
            lookback: 回看最近 N 根 K 線

        Returns:
            近期形態列表
        """
        if not patterns:
            return []

        start_index = max(0, max_index - lookback)
        return [
            p
            for p in patterns
            if p["index"] >= start_index and p["index"] <= max_index
        ]


def create_pattern_service() -> PatternService:
    """建立 K 線形態辨識服務實例"""
    return PatternService()
