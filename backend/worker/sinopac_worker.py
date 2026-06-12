"""
永豐金 Shioaji 股票服務 — Singleton 長連線模式

核心概念：
- Shioaji 是 Stateful 長連線，不能每次請求都重新登入
- 全域只維持一條 Session，避免被券商阻斷
- fetch_contract=True 在背景下載合約，contracts_cb 通知完成
- api.kbars(state=KLinesState.Daily) 直接取日K，不需聚合分K
"""
import asyncio
import logging
import threading
import time
from datetime import date, timedelta
from functools import partial
from typing import Optional

logger = logging.getLogger(__name__)


class SinopacStockService:
    """永豐金 Shioaji 單例服務，維持全域唯一長連線"""

    _instance: Optional["SinopacStockService"] = None
    _class_lock = threading.Lock()

    def __new__(cls):
        with cls._class_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.api = None
        self.is_connected = False
        self._contracts_ready = threading.Event()
        self._connect_lock = threading.Lock()
        self._initialized = True

    def connect_and_login(self, api_key: str, secret_key: str) -> bool:
        """建立與永豐金伺服器的長連線（同步，在 executor 中執行）"""
        # 已就緒直接回傳
        if self.is_connected and self._contracts_ready.is_set():
            return True

        with self._connect_lock:
            # Double-check after acquiring lock
            if self.is_connected and self._contracts_ready.is_set():
                return True

            try:
                import shioaji as sj

                logger.info("正在建立永豐金 Shioaji 長連線 Session...")
                self.api = sj.Shioaji()

                loaded_types = []

                def _contracts_cb(security_type):
                    loaded_types.append(str(security_type))
                    logger.info(f"永豐金合約載入通知: {security_type}")

                self.api.login(
                    api_key=api_key,
                    secret_key=secret_key,
                    fetch_contract=True,
                    contracts_timeout=0,   # 0 = 非同步下載，callback 通知進度
                    contracts_cb=_contracts_cb,
                )

                self.is_connected = True
                logger.info("永豐金登入成功，開始 poll 等待股票合約就緒...")

                # Poll 直到 2330 合約可用（最多 120 秒）
                # callback 觸發時合約資料可能尚未寫入，需主動驗證
                for i in range(120):
                    time.sleep(1)
                    try:
                        contract = self.api.Contracts.Stocks.get("2330")
                        if contract is not None:
                            self._contracts_ready.set()
                            logger.info(f"永豐金股票合約就緒（等待 {i+1}s），開始提供台股日K服務")
                            break
                    except Exception:
                        pass
                else:
                    logger.warning("永豐金合約等待 120s 超時，台股日K將 fallback 到 yfinance")

                return True

            except Exception as e:
                logger.error(f"永豐金連線失敗: {e}")
                self.is_connected = False
                return False

    def get_historical_kline(
        self, stock_code: str, start_date: str, end_date: str
    ) -> list[dict]:
        """
        取得歷史日K線（類似 yfinance.download() 的高階封裝）

        Args:
            stock_code: 股票代碼，如 "2330"
            start_date: 開始日期 "YYYY-MM-DD"
            end_date:   結束日期 "YYYY-MM-DD"

        Returns:
            List of dicts: [{date, open, high, low, close, adjclose, volume}, ...]
        """
        if not self.is_connected:
            logger.warning(f"Sinopac 尚未連線，無法取得 {stock_code} 資料")
            return []

        if not self._contracts_ready.is_set():
            logger.warning(f"Sinopac 合約尚未就緒，無法取得 {stock_code} 資料")
            return []

        try:
            import shioaji as sj

            contract = self.api.Contracts.Stocks[stock_code]
            if contract is None:
                logger.warning(f"找不到合約: {stock_code}")
                return []

            import pandas as pd

            # shioaji kbars 回傳分K，最多支援 ~30 天範圍（避免超時）
            # 大範圍歷史資料由 yfinance fallback 處理
            from datetime import datetime as _dt
            days_range = (_dt.strptime(end_date, "%Y-%m-%d") - _dt.strptime(start_date, "%Y-%m-%d")).days
            if days_range > 35:
                logger.info(f"Sinopac kbars 不適合大範圍 ({days_range}d)，略過由 yfinance 處理")
                return []

            logger.info(f"從永豐金下載 {stock_code} 分K → 日K ({start_date} ~ {end_date})")
            kbars = self.api.kbars(
                contract=contract,
                start=start_date,
                end=end_date,
                timeout=10000,  # 10s timeout for larger ranges
            )

            df = pd.DataFrame({**kbars})
            if df.empty:
                return []

            df["ts"] = pd.to_datetime(df["ts"])
            df["date"] = df["ts"].dt.date

            # 聚合分K → 日K
            daily = df.groupby("date").agg(
                open=("Open", "first"),
                high=("High", "max"),
                low=("Low", "min"),
                close=("Close", "last"),
                volume=("Volume", "sum"),
            ).reset_index()

            result = []
            for _, row in daily.iterrows():
                result.append({
                    "date": row["date"],
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "adjclose": float(row["close"]),
                    "volume": int(row["volume"]) * 1000,
                })

            result.sort(key=lambda x: x["date"])
            logger.info(f"永豐金 {stock_code} 取得 {len(result)} 筆日K")
            return result

        except Exception as e:
            logger.error(f"取得 {stock_code} 歷史K線失敗: {e}")
            return []

    def logout(self):
        """安全釋放長連線"""
        if self.is_connected and self.api:
            try:
                self.api.logout()
                logger.info("永豐金長連線已安全關閉")
            except Exception as e:
                logger.warning(f"永豐金登出時發生錯誤: {e}")
            finally:
                self.is_connected = False
                self._contracts_ready.clear()


# 全域單例
sinopac_service = SinopacStockService()


async def run_in_executor(func, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(func, *args))


async def connect_sinopac(api_key: str, secret_key: str) -> bool:
    """在 executor 中執行登入（不阻塞 event loop）"""
    return await run_in_executor(sinopac_service.connect_and_login, api_key, secret_key)


async def fetch_kline_sinopac(stock_code: str, days: int = 1095) -> list[dict]:
    """
    取得台股歷史日K線（優先 Sinopac，需先呼叫 connect_sinopac）
    days: 回看天數，預設 3 年
    """
    end = date.today()
    start = end - timedelta(days=days)
    return await run_in_executor(
        sinopac_service.get_historical_kline,
        stock_code,
        start.strftime("%Y-%m-%d"),
        end.strftime("%Y-%m-%d"),
    )
