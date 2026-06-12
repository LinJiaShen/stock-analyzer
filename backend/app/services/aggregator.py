"""
K線聚合器 - 將 tick 數據聚合為 1m/5m/日K
"""

from datetime import datetime, date, time, timezone, timedelta
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable
import asyncio

TAIPEI_TZ = timezone(timedelta(hours=8))


@dataclass
class Candle:
    """K線數據"""
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    turnover: float = 0.0
    # 分鐘K專用
    minute_bar: bool = False
    # 完成狀態
    completed: bool = False


@dataclass
class CandleAggregator:
    """
    Tick → K線聚合器
    支援 1m, 5m, daily 三種粒度
    """
    stock_code: str
    on_candle_update: Callable[[Candle, str], Awaitable[None]]
    on_candle_complete: Optional[Callable[[Candle, str], Awaitable[None]]] = None
    # 當前聚合中的 K 線
    _current_daily: Optional[Candle] = None
    _current_1m: Optional[Candle] = None
    _current_5m: Optional[Candle] = None
    # 5m 計數器
    _5m_count: int = 0
    # 市場狀態
    _market_open: bool = False
    # 事件鎖
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def _is_market_hours(self, now: datetime) -> bool:
        """檢查是否在台灣股市交易時間內 (09:00-12:50, 13:00-13:30)"""
        t = now.time()
        morning = time(9, 0) <= t <= time(12, 50)
        afternoon = time(13, 0) <= t <= time(13, 30)
        return morning or afternoon

    def _get_current_date(self) -> date:
        """取得台灣時間當前日期"""
        return datetime.now(TAIPEI_TZ).date()

    def _get_current_minute(self) -> datetime:
        """取得台灣時間當前分鐘時間戳"""
        now = datetime.now(TAIPEI_TZ)
        return now.replace(second=0, microsecond=0)

    def _get_5m_bucket(self, minute: datetime) -> datetime:
        """取得 5 分鐘區間起始時間"""
        m = minute.minute - (minute.minute % 5)
        return minute.replace(minute=m)

    async def process_tick(self, tick_data: dict):
        """
        處理單筆 tick 數據
        tick_data 格式: {
            "last_price": float,
            "volume": int,
            "turnover": float,
            "trade_date": str,  # "YYYYMMDD"
            "trade_time": str,  # "HHMMSS"
        }
        """
        async with self._lock:
            price = tick_data.get("last_price", 0)
            volume = tick_data.get("volume", 0)
            turnover = tick_data.get("turnover", 0.0)
            trade_date_str = tick_data.get("trade_date", "")
            trade_time_str = tick_data.get("trade_time", "")

            if price <= 0:
                return

            # 解析交易時間
            now = datetime.now(TAIPEI_TZ)
            current_date = now.date()
            current_minute = self._get_current_minute()
            current_5m = self._get_5m_bucket(current_minute)

            # === 日K 聚合 ===
            await self._aggregate_daily(price, volume, turnover, current_date)

            # === 1m K 聚合 ===
            await self._aggregate_1m(price, volume, turnover, current_minute)

            # === 5m K 聚合 ===
            await self._aggregate_5m(price, volume, turnover, current_5m)

    async def _aggregate_daily(self, price: float, volume: int, turnover: float, current_date: date):
        """聚合日K"""
        if self._current_daily is None or self._current_daily.open_time.date() != current_date:
            # 新的一天，完成舊的日K
            if self._current_daily and not self._current_daily.completed:
                self._current_daily.completed = True
                if self.on_candle_complete:
                    await self.on_candle_complete(self._current_daily, "daily")

            # 開始新的日K
            self._current_daily = Candle(
                open_time=datetime.combine(current_date, time(9, 0), tzinfo=TAIPEI_TZ),
                open=price,
                high=price,
                low=price,
                close=price,
                volume=volume,
                turnover=turnover,
                minute_bar=False,
            )
        else:
            # 更新當前日K
            self._current_daily.high = max(self._current_daily.high, price)
            self._current_daily.low = min(self._current_daily.low, price)
            self._current_daily.close = price
            self._current_daily.volume += volume
            self._current_daily.turnover += turnover

        # 發送更新
        await self.on_candle_update(self._current_daily, "daily")

    async def _aggregate_1m(self, price: float, volume: int, turnover: float, current_minute: datetime):
        """聚合 1 分鐘 K"""
        if self._current_1m is None or self._current_1m.open_time != current_minute:
            # 新的一分鐘，完成舊的 1m K
            if self._current_1m and not self._current_1m.completed:
                self._current_1m.completed = True
                if self.on_candle_complete:
                    await self.on_candle_complete(self._current_1m, "1m")

            # 開始新的 1m K
            self._current_1m = Candle(
                open_time=current_minute,
                open=price,
                high=price,
                low=price,
                close=price,
                volume=volume,
                turnover=turnover,
                minute_bar=True,
            )
        else:
            # 更新當前 1m K
            self._current_1m.high = max(self._current_1m.high, price)
            self._current_1m.low = min(self._current_1m.low, price)
            self._current_1m.close = price
            self._current_1m.volume += volume
            self._current_1m.turnover += turnover

        # 發送更新
        await self.on_candle_update(self._current_1m, "1m")

    async def _aggregate_5m(self, price: float, volume: int, turnover: float, current_5m: datetime):
        """聚合 5 分鐘 K"""
        if self._current_5m is None or self._current_5m.open_time != current_5m:
            # 新的 5m 區間，完成舊的 5m K
            if self._current_5m and not self._current_5m.completed:
                self._current_5m.completed = True
                if self.on_candle_complete:
                    await self.on_candle_complete(self._current_5m, "5m")

            # 開始新的 5m K
            self._current_5m = Candle(
                open_time=current_5m,
                open=price,
                high=price,
                low=price,
                close=price,
                volume=volume,
                turnover=turnover,
                minute_bar=True,
            )
            self._5m_count = 1
        else:
            # 更新當前 5m K
            self._current_5m.high = max(self._current_5m.high, price)
            self._current_5m.low = min(self._current_5m.low, price)
            self._current_5m.close = price
            self._current_5m.volume += volume
            self._current_5m.turnover += turnover
            self._5m_count += 1

        # 發送更新
        await self.on_candle_update(self._current_5m, "5m")

    async def reset(self):
        """重置聚合器狀態"""
        async with self._lock:
            self._current_daily = None
            self._current_1m = None
            self._current_5m = None
            self._5m_count = 0

    def get_current_daily(self) -> Optional[Candle]:
        """取得當前日K（非同步）"""
        return self._current_daily

    def get_current_1m(self) -> Optional[Candle]:
        """取得當前 1m K（非同步）"""
        return self._current_1m

    def get_current_5m(self) -> Optional[Candle]:
        """取得當前 5m K（非同步）"""
        return self._current_5m
