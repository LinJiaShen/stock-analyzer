"""
訂閱管理服務 - 管理 Sinopac tick 訂閱與 WebSocket 連線池
"""

import asyncio
import logging
from typing import Dict, Set, Optional
from datetime import datetime, time, timezone, timedelta
from contextlib import asynccontextmanager

from fastapi import WebSocket, WebSocketDisconnect

from worker.sinopac_worker import SinopacStockService
from app.services.aggregator import CandleAggregator, Candle, TAIPEI_TZ

logger = logging.getLogger(__name__)


class SubscriptionManager:
    """
    單例訂閱管理服務
    - 管理所有 WebSocket 連線
    - 管理 Sinopac tick 訂閱
    - 管理 K 線聚合器
    - 處理 tick 分發到 WebSocket 客戶端
    """

    _instance = None
    _class_lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True

        # WebSocket 連線池: {stock_code: {websocket: True}}
        self._connections: Dict[str, Dict[WebSocket, bool]] = {}
        # K 線聚合器: {stock_code: CandleAggregator}
        self._aggregators: Dict[str, CandleAggregator] = {}
        # Sinopac 訂閱狀態: {stock_code: True}
        self._subscribed: Dict[str, bool] = {}
        # 鎖定
        self._lock = asyncio.Lock()
        # Sinopac 服務
        self._sinopac: Optional[SinopacStockService] = None
        # 是否正在運行
        self._running = False
        # 主事件迴圈（Shioaji 回調在獨立執行緒，需要用它把 tick 丟回來）
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        # 全域 tick 回調是否已註冊（shioaji v1 為全域回調，只設一次）
        self._tick_callback_set = False

    def _is_market_hours(self) -> bool:
        """檢查是否在台灣股市交易時間內"""
        now = datetime.now(TAIPEI_TZ)
        t = now.time()
        weekday = now.weekday()  # 0=Monday, 4=Friday
        if weekday >= 5:  # 週末
            return False
        morning = time(9, 0) <= t <= time(12, 50)
        afternoon = time(13, 0) <= t <= time(13, 30)
        return morning or afternoon

    async def initialize(self):
        """初始化 Sinopac 服務"""
        if self._sinopac:
            return
        self._sinopac = SinopacStockService()
        # 檢查是否已連線
        if not self._sinopac.is_connected:
            from app.config import Settings
            settings = Settings()
            try:
                success = self._sinopac.connect_and_login(
                    settings.SINOPAC_API_KEY,
                    settings.SINOPAC_SECRET_KEY
                )
                if success:
                    logger.info("Sinopac 連線成功")
                else:
                    logger.warning("Sinopac 連線失敗")
            except Exception as e:
                logger.error(f"Sinopac 連線錯誤: {e}")

    def _make_candle_callbacks(self, stock_code: str):
        """為指定股票建立 K 線回調閉包"""

        async def on_candle_update(candle: Candle, interval: str):
            message = {
                "type": "candle_update",
                "stock_code": stock_code,
                "interval": interval,
                "data": {
                    "open_time": candle.open_time.isoformat(),
                    "open": candle.open,
                    "high": candle.high,
                    "low": candle.low,
                    "close": candle.close,
                    "volume": candle.volume,
                    "turnover": candle.turnover,
                    "minute_bar": candle.minute_bar,
                    "completed": candle.completed,
                },
            }
            await self._broadcast(stock_code, message)

        async def on_candle_complete(candle: Candle, interval: str):
            logger.info(f"K線完成 [{stock_code}]: {candle.open_time} {interval}")

        return on_candle_update, on_candle_complete

    async def _broadcast(self, stock_code: str, message: dict):
        """廣播消息給所有訂閱該股票的 WebSocket 客戶端"""
        connections = self._connections.get(stock_code, {})
        disconnected = []

        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"WebSocket 發送失敗: {e}")
                disconnected.append(ws)

        # 清理斷開的連線
        for ws in disconnected:
            if stock_code in self._connections:
                self._connections[stock_code].pop(ws, None)

    async def _handle_tick(self, tick_data: dict):
        """
        處理 Sinopac tick 回調
        此方法會被 Shioaji 的 tick 回調呼叫
        """
        stock_code = tick_data.get("stock_code", "")
        if not stock_code:
            return

        aggregator = self._aggregators.get(stock_code)
        if aggregator:
            try:
                await aggregator.process_tick(tick_data)
            except Exception as e:
                logger.error(f"Tick 處理錯誤 [{stock_code}]: {e}")

    async def add_connection(self, stock_code: str, websocket: WebSocket):
        """新增 WebSocket 連線"""
        async with self._lock:
            if stock_code not in self._connections:
                self._connections[stock_code] = {}
            self._connections[stock_code][websocket] = True

            # 如果是第一個連線，建立聚合器並訂閱 Sinopac
            if stock_code not in self._aggregators:
                await self._setup_aggregator(stock_code)

    async def remove_connection(self, stock_code: str, websocket: WebSocket):
        """
        移除 WebSocket 連線。

        注意：刻意「不」取消 Shioaji 訂閱與聚合器 —
        前端 reload / React StrictMode 會造成快速斷線重連，
        頻繁 unsubscribe→subscribe 會漏 tick。訂閱保留到服務停止（stop()）。
        """
        async with self._lock:
            if stock_code in self._connections:
                self._connections[stock_code].pop(websocket, None)
                if not self._connections[stock_code]:
                    del self._connections[stock_code]

    async def _setup_aggregator(self, stock_code: str):
        """為股票建立 K 線聚合器並訂閱 Sinopac"""
        on_candle_update, on_candle_complete = self._make_candle_callbacks(stock_code)
        aggregator = CandleAggregator(
            stock_code=stock_code,
            on_candle_update=on_candle_update,
            on_candle_complete=on_candle_complete,
        )
        self._aggregators[stock_code] = aggregator

        # 訂閱 Sinopac tick
        if self._is_market_hours() and self._sinopac and self._sinopac.is_connected:
            await self._subscribe_sinopac(stock_code)

    def _ensure_tick_callback(self):
        """
        註冊 Shioaji v1 全域 tick 回調（只設一次）。

        注意：回調在 Shioaji 的 solace 執行緒中執行，
        必須用 run_coroutine_threadsafe 把資料丟回主事件迴圈。
        """
        if self._tick_callback_set or not self._sinopac or not self._sinopac.api:
            return

        manager = self  # 閉包引用

        def on_tick(exchange, tick):
            """TickSTKv1 回調（Shioaji 執行緒）"""
            try:
                tick_data = {
                    "stock_code": str(tick.code),
                    "last_price": float(tick.close),
                    "volume": int(tick.volume),          # 單筆成交量（張）
                    "turnover": float(tick.amount),      # 單筆成交金額
                    "trade_date": "",
                    "trade_time": tick.datetime.strftime("%H%M%S") if getattr(tick, "datetime", None) else "",
                }
                if manager._loop and not manager._loop.is_closed():
                    asyncio.run_coroutine_threadsafe(
                        manager._handle_tick(tick_data), manager._loop
                    )
            except Exception as e:
                logger.error(f"Tick 回調錯誤: {e}")

        self._sinopac.api.quote.set_on_tick_stk_v1_callback(on_tick)
        self._tick_callback_set = True
        logger.info("Shioaji v1 tick 全域回調已註冊")

    async def _subscribe_sinopac(self, stock_code: str):
        """訂閱 Sinopac tick"""
        if stock_code in self._subscribed:
            return

        try:
            if not self._sinopac or not self._sinopac.is_connected:
                logger.warning("Sinopac 未連線，無法訂閱 tick")
                return

            import shioaji as sj

            self._ensure_tick_callback()

            contract = self._sinopac.api.Contracts.Stocks[stock_code]
            self._sinopac.api.quote.subscribe(
                contract,
                quote_type=sj.constant.QuoteType.Tick,
                version=sj.constant.QuoteVersion.v1,
            )

            self._subscribed[stock_code] = True
            logger.info(f"已訂閱 {stock_code} tick 數據")

        except Exception as e:
            logger.error(f"訂閱 Sinopac tick 失敗 [{stock_code}]: {e}")

    async def _cleanup_stock(self, stock_code: str):
        """清理股票的訂閱資源"""
        # 取消 Sinopac 訂閱
        if stock_code in self._subscribed and self._sinopac and self._sinopac.is_connected:
            try:
                import shioaji as sj
                contract = self._sinopac.api.Contracts.Stocks[stock_code]
                self._sinopac.api.quote.unsubscribe(
                    contract,
                    quote_type=sj.constant.QuoteType.Tick,
                    version=sj.constant.QuoteVersion.v1,
                )
                logger.info(f"已取消訂閱 {stock_code} tick")
            except Exception as e:
                logger.error(f"取消訂閱失敗 [{stock_code}]: {e}")

            self._subscribed.pop(stock_code, None)

        # 清理聚合器
        if stock_code in self._aggregators:
            await self._aggregators[stock_code].reset()
            del self._aggregators[stock_code]

    async def start(self):
        """啟動訂閱管理服務"""
        if self._running:
            return
        self._running = True
        # 記住主事件迴圈，供 Shioaji 執行緒回調使用
        self._loop = asyncio.get_running_loop()
        await self.initialize()
        logger.info("訂閱管理服務已啟動")

    async def stop(self):
        """停止訂閱管理服務"""
        if not self._running:
            return
        self._running = False

        # 清理所有訂閱
        for stock_code in list(self._subscribed.keys()):
            await self._cleanup_stock(stock_code)

        # 關閉所有 WebSocket 連線
        for stock_code, connections in list(self._connections.items()):
            for ws in list(connections.keys()):
                try:
                    await ws.close()
                except Exception:
                    pass
            self._connections[stock_code].clear()

        logger.info("訂閱管理服務已停止")

    def get_active_subscriptions(self) -> Dict[str, int]:
        """取得目前活躍的訂閱數"""
        return {code: len(conns) for code, conns in self._connections.items()}


# 全域單例
subscription_manager = SubscriptionManager()
