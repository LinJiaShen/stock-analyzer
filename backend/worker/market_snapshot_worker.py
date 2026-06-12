"""
全市場每日 K 線快照 Worker

兩個 OpenAPI 請求即可覆蓋全市場（上市 + 上櫃，含 ETF）：
- TWSE: /v1/exchangeReport/STOCK_DAY_ALL（約 1,300+ 檔）
- TPEx: /v1/tpex_mainboard_quotes（約 1,000+ 檔）

每筆資料自帶 Date（民國格式），以 (stock_code, trade_date) upsert，
重複執行冪等。搭配每日 18:05 排程，全市場 K 線自動累積。
"""
import logging
from datetime import date

import httpx

from app.database import async_session_factory
from sqlalchemy import select, text

logger = logging.getLogger(__name__)

TWSE_DAY_ALL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TPEX_QUOTES = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"


def _roc_to_date(roc: str) -> date | None:
    """民國日期字串（1150611）→ date"""
    try:
        roc = str(roc).strip()
        if len(roc) != 7:
            return None
        return date(int(roc[:3]) + 1911, int(roc[3:5]), int(roc[5:7]))
    except (ValueError, TypeError):
        return None


def _num(value) -> float | None:
    """報價字串 → float（'--' 等無效值回 None）"""
    try:
        v = str(value).replace(",", "").replace("+", "").strip()
        if not v or v in ("--", "---", "除權息", "除息", "除權"):
            return None
        return float(v)
    except (ValueError, TypeError):
        return None


class MarketSnapshotWorker:
    """全市場每日行情快照"""

    async def fetch_twse_all(self) -> list[dict]:
        """上市全部個股當日 OHLCV"""
        try:
            async with httpx.AsyncClient(timeout=60.0, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }) as client:
                res = await client.get(TWSE_DAY_ALL)
                res.raise_for_status()
                items = res.json()
        except Exception as e:
            logger.error(f"TWSE STOCK_DAY_ALL 抓取失敗: {e}")
            return []

        rows = []
        for it in items:
            trade_date = _roc_to_date(it.get("Date", ""))
            close = _num(it.get("ClosingPrice"))
            if not trade_date or close is None:
                continue
            rows.append({
                "stock_code": (it.get("Code") or "").strip(),
                "trade_date": trade_date,
                "open": _num(it.get("OpeningPrice")),
                "high": _num(it.get("HighestPrice")),
                "low": _num(it.get("LowestPrice")),
                "close": close,
                "volume": _num(it.get("TradeVolume")) or 0,  # 股數
                "amount": _num(it.get("TradeValue")),         # 成交金額（元）
            })
        return rows

    async def fetch_tpex_all(self) -> list[dict]:
        """上櫃全部個股當日 OHLCV"""
        try:
            async with httpx.AsyncClient(timeout=60.0, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }) as client:
                res = await client.get(TPEX_QUOTES)
                res.raise_for_status()
                items = res.json()
        except Exception as e:
            logger.error(f"TPEx mainboard_quotes 抓取失敗: {e}")
            return []

        rows = []
        for it in items:
            trade_date = _roc_to_date(it.get("Date", ""))
            close = _num(it.get("Close"))
            if not trade_date or close is None:
                continue
            rows.append({
                "stock_code": (it.get("SecuritiesCompanyCode") or "").strip(),
                "trade_date": trade_date,
                "open": _num(it.get("Open")),
                "high": _num(it.get("High")),
                "low": _num(it.get("Low")),
                "close": close,
                "volume": _num(it.get("TradingShares")) or 0,
                "amount": _num(it.get("TransactionAmount")),  # 成交金額（元）
            })
        return rows

    async def upsert_bars(self, rows: list[dict]) -> int:
        """
        Upsert daily_bars（僅限 stocks 表中存在的代碼，避免 FK 失敗）

        adjusted_close 以 close 寫入（除權息還原由歷史回補時的 yfinance auto_adjust 處理；
        快照日當天 close == adjusted_close）。
        """
        if not rows:
            return 0

        async with async_session_factory() as session:
            res = await session.execute(text("SELECT code FROM stocks"))
            valid = {r[0] for r in res.all()}

            stmt = text("""
                INSERT INTO daily_bars
                    (stock_code, trade_date, open_price, high_price, low_price,
                     close_price, adjusted_close, volume, amount)
                VALUES
                    (:stock_code, :trade_date, :open, :high, :low, :close, :close, :volume, :amount)
                ON CONFLICT (stock_code, trade_date) DO UPDATE SET
                    open_price = EXCLUDED.open_price,
                    high_price = EXCLUDED.high_price,
                    low_price = EXCLUDED.low_price,
                    close_price = EXCLUDED.close_price,
                    adjusted_close = EXCLUDED.adjusted_close,
                    volume = EXCLUDED.volume,
                    amount = EXCLUDED.amount
            """)

            count = 0
            for row in rows:
                if row["stock_code"] not in valid:
                    continue
                await session.execute(stmt, row)
                count += 1

            await session.commit()
            return count


# 全域實例
market_snapshot_worker = MarketSnapshotWorker()


async def fetch_market_snapshot():
    """定時任務：全市場每日 K 線快照（18:05）"""
    logger.info("開始抓取全市場每日行情快照...")
    twse = await market_snapshot_worker.fetch_twse_all()
    tpex = await market_snapshot_worker.fetch_tpex_all()
    saved = await market_snapshot_worker.upsert_bars(twse + tpex)
    logger.info(f"全市場快照完成: 上市 {len(twse)} + 上櫃 {len(tpex)} 檔，寫入 {saved} 筆")
    return {"twse": len(twse), "tpex": len(tpex), "saved": saved}
