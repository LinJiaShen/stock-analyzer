"""
三大法人籌碼 Worker

TWSE T86 端點：單一請求取得全市場個股的三大法人買賣超（依日期）。
數值單位為股數，存入 chip_data 時換算為張（÷1000）。

注意 TWSE 速率限制：每次請求間隔 3 秒以上 + Redis 快取。
"""
import asyncio
import logging
from datetime import date, datetime, timedelta

import httpx

from app.database import async_session_factory
from app.models.daily_bar import ChipData
from app.utils.cache import Cache
from sqlalchemy import select

logger = logging.getLogger(__name__)

T86_URL = "https://www.twse.com.tw/rwd/zh/fund/T86"
# TWSE 融資融券（RWD 版，selectType=ALL 才有個股明細）
MI_MARGN_URL = "https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN"


def _parse_lots(value: str | None) -> float:
    """MI_MARGN 數值已是張，去除千分位直接轉數字"""
    if not value:
        return 0.0
    try:
        return float(str(value).replace(",", "").strip() or 0)
    except (ValueError, TypeError):
        return 0.0


def _to_lots(value: str | None) -> float:
    """股數字串 → 張數"""
    if not value:
        return 0.0
    try:
        return round(int(str(value).replace(",", "")) / 1000, 1)
    except (ValueError, TypeError):
        return 0.0


class ChipWorker:
    """三大法人籌碼抓取服務"""

    def __init__(self):
        self.cache = Cache()

    async def fetch_t86(self, trade_date: date) -> list[dict]:
        """
        抓取指定日期全市場三大法人買賣超

        Returns:
            [{stock_code, foreign_buy/sell/net, trust_..., proprietary_...}, ...]
            （單位：張）
        """
        date_str = trade_date.strftime("%Y%m%d")
        cache_key = f"t86:{date_str}"
        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            async with httpx.AsyncClient(timeout=30.0, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://www.twse.com.tw/zh/trading/foreign/t86.html",
            }) as client:
                res = await client.get(T86_URL, params={
                    "date": date_str,
                    "selectType": "ALLBUT0999",  # 全部（不含權證）
                    "response": "json",
                })
                if res.status_code != 200:
                    logger.warning(f"T86 回應異常 [{date_str}]: {res.status_code}")
                    return []
                data = res.json()
        except Exception as e:
            logger.warning(f"T86 抓取失敗 [{date_str}]: {e}")
            return []

        if data.get("stat") != "OK":
            # 非交易日或資料未公布
            await self.cache.set(cache_key, [], expire=3600)
            return []

        # 欄位順序（TWSE T86 ALLBUT0999）：
        # 0證券代號 1證券名稱 2外陸資買進(不含外資自營) 3外陸資賣出 4外陸資買賣超
        # 5外資自營買進 6外資自營賣出 7外資自營買賣超
        # 8投信買進 9投信賣出 10投信買賣超
        # 11自營商買賣超 12自營商買進(自行) 13自營商賣出(自行) 14自營商買賣超(自行)
        # 15自營商買進(避險) 16自營商賣出(避險) 17自營商買賣超(避險) 18三大法人買賣超
        rows = []
        for raw in data.get("data", []):
            try:
                rows.append({
                    "stock_code": raw[0].strip(),
                    "foreign_buy": _to_lots(raw[2]),
                    "foreign_sell": _to_lots(raw[3]),
                    "foreign_net": _to_lots(raw[4]),
                    "trust_buy": _to_lots(raw[8]),
                    "trust_sell": _to_lots(raw[9]),
                    "trust_net": _to_lots(raw[10]),
                    "proprietary_buy": _to_lots(raw[12]) + _to_lots(raw[15]),
                    "proprietary_sell": _to_lots(raw[13]) + _to_lots(raw[16]),
                    "proprietary_net": _to_lots(raw[11]),
                })
            except (IndexError, AttributeError):
                continue

        await self.cache.set(cache_key, rows, expire=86400)
        return rows

    async def fetch_mi_margn(self, trade_date: date, market: str = "twse") -> list[dict]:
        """
        抓取指定日期全市場融資餘額（TWSE MI_MARGN，支持上市/上櫃）

        Args:
            trade_date: 交易日期
            market: "twse" (上市) 或 "tpex" (上櫃)

        Returns:
            [{stock_code, margin_buy, margin_sell, margin_balance, margin_net}, ...]
            （單位：張）
        """
        date_str = trade_date.strftime("%Y%m%d")
        cache_key = f"mi_margn:v2:{market}:{date_str}"
        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            params = {
                "date": date_str,
                "selectType": "ALL",
                "response": "json",
            }
            if market == "tpex":
                params["channel"] = "tpex"

            async with httpx.AsyncClient(
                timeout=30.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": "https://www.twse.com.tw/zh/trading/margin/mi-margn.html",
                    "Accept": "application/json, text/plain, */*",
                },
            ) as client:
                res = await client.get(MI_MARGN_URL, params=params)
                if res.status_code != 200:
                    logger.warning(f"MI_MARGN[{market}] 回應異常 [{date_str}]: {res.status_code}")
                    return []
                data = res.json()
        except Exception as e:
            logger.warning(f"MI_MARGN[{market}] 抓取失敗 [{date_str}]: {e}")
            return []

        if data.get("stat") != "OK":
            # 非交易日或資料未公布（短快取，當日盤後可能稍晚才公布）
            await self.cache.set(cache_key, [], expire=1800)
            return []

        # RWD 版回應：tables[0]=信用交易統計，tables[1]=融資融券個股明細
        # 個股明細欄位：0代號 1名稱
        # 融資：2買進 3賣出 4現金償還 5前日餘額 6今日餘額 7限額
        # 融券：8買進 9賣出 10現券償還 11前日餘額 12今日餘額 13限額  14資券互抵 15註記
        # ※ 數值單位已是「張」，無需換算
        stock_table = None
        for t in data.get("tables", []):
            if len(t.get("data", [])) > 100:  # 個股明細表（千餘筆）
                stock_table = t
                break

        if not stock_table:
            logger.warning(f"MI_MARGN 找不到個股明細表 [{date_str}]")
            await self.cache.set(cache_key, [], expire=1800)
            return []

        rows = []
        for raw in stock_table["data"]:
            try:
                buy = _parse_lots(raw[2])
                sell = _parse_lots(raw[3])
                rows.append({
                    "stock_code": str(raw[0]).strip(),
                    "margin_buy": buy,
                    "margin_sell": sell,
                    "margin_balance": _parse_lots(raw[6]),
                    "margin_net": round(buy - sell, 1),
                })
            except (IndexError, AttributeError, TypeError):
                continue

        await self.cache.set(cache_key, rows, expire=86400)
        return rows

    async def save_chip_data(self, trade_date: date, rows: list[dict]) -> int:
        """存入 chip_data（僅存 DB 中存在的股票，已存在的日期跳過）"""
        if not rows:
            return 0

        from app.models.stock import Stock

        async with async_session_factory() as session:
            # DB 中存在的股票代碼
            stock_res = await session.execute(select(Stock.code))
            valid_codes = {r for (r,) in stock_res.all()}

            # 該日已有資料的股票
            existing_res = await session.execute(
                select(ChipData.stock_code).where(ChipData.trade_date == trade_date)
            )
            existing = {r for (r,) in existing_res.all()}

            saved = 0
            for row in rows:
                code = row["stock_code"]
                if code not in valid_codes or code in existing:
                    continue
                session.add(ChipData(
                    stock_code=code,
                    trade_date=trade_date,
                    foreign_buy=row["foreign_buy"],
                    foreign_sell=row["foreign_sell"],
                    foreign_net=row["foreign_net"],
                    trust_buy=row["trust_buy"],
                    trust_sell=row["trust_sell"],
                    trust_net=row["trust_net"],
                    proprietary_buy=row["proprietary_buy"],
                    proprietary_sell=row["proprietary_sell"],
                    proprietary_net=row["proprietary_net"],
                ))
                saved += 1

            await session.commit()
            return saved

    async def update_margin_data(self, trade_date: date, margin_rows: list[dict]) -> int:
        """以融資資料 UPDATE 當日 chip_data（T86 必須先執行過）。使用原生 SQL 批量更新。"""
        if not margin_rows:
            return 0

        from sqlalchemy import text

        # 建立 (stock_code, margin_buy, margin_sell, margin_balance, margin_net) 值列表
        values_sql = ", ".join(
            f"('{row['stock_code']}', {row['margin_buy']}, {row['margin_sell']}, "
            f"{row['margin_balance']}, {row['margin_net']})"
            for row in margin_rows
        )

        sql = text(f"""
            UPDATE chip_data AS c
            SET
                margin_buy      = v.margin_buy,
                margin_sell     = v.margin_sell,
                margin_balance  = v.margin_balance,
                margin_net      = v.margin_net
            FROM (VALUES {values_sql})
                AS v(stock_code, margin_buy, margin_sell, margin_balance, margin_net)
            WHERE c.stock_code = v.stock_code
              AND c.trade_date = :trade_date
        """)

        async with async_session_factory() as session:
            result = await session.execute(sql, {"trade_date": trade_date})
            await session.commit()
            return result.rowcount


# 全域實例
chip_worker = ChipWorker()


async def fetch_daily_chip():
    """定時任務：抓取今日三大法人買賣超 + 融資餘額（上市+上櫃，盤後 18:30 執行）"""
    today = date.today()
    logger.info(f"開始抓取 {today} 三大法人籌碼...")
    rows = await chip_worker.fetch_t86(today)
    saved = await chip_worker.save_chip_data(today, rows)
    logger.info(f"T86 完成: 全市場 {len(rows)} 檔，新增 {saved} 筆")

    await asyncio.sleep(3)
    logger.info(f"開始抓取 {today} 融資餘額（上市）...")
    margin_rows_twse = await chip_worker.fetch_mi_margn(today, market="twse")
    updated_twse = await chip_worker.update_margin_data(today, margin_rows_twse)
    logger.info(f"MI_MARGN[上市] 完成: {len(margin_rows_twse)} 檔，更新 {updated_twse} 筆")

    await asyncio.sleep(3)
    logger.info(f"開始抓取 {today} 融資餘額（上櫃）...")
    margin_rows_tpex = await chip_worker.fetch_mi_margn(today, market="tpex")
    updated_tpex = await chip_worker.update_margin_data(today, margin_rows_tpex)
    logger.info(f"MI_MARGN[上櫃] 完成: {len(margin_rows_tpex)} 檔，更新 {updated_tpex} 筆")


async def backfill_chip_data(days: int = 30):
    """回補近 N 個日曆天的籌碼資料 + 融資餘額（上市+上櫃，自動跳過非交易日）"""
    logger.info(f"開始回補近 {days} 天籌碼資料...")
    total = 0
    for i in range(days):
        d = date.today() - timedelta(days=i)
        if d.weekday() >= 5:
            continue
        rows = await chip_worker.fetch_t86(d)
        if rows:
            saved = await chip_worker.save_chip_data(d, rows)
            total += saved
            logger.info(f"  {d}: T86 {len(rows)} 檔，新增 {saved} 筆")
        await asyncio.sleep(3)

        # 上市融資
        margin_rows_twse = await chip_worker.fetch_mi_margn(d, market="twse")
        if margin_rows_twse:
            updated = await chip_worker.update_margin_data(d, margin_rows_twse)
            logger.info(f"  {d}: MI_MARGN[上市] {len(margin_rows_twse)} 檔，更新 {updated} 筆")
        await asyncio.sleep(3)

        # 上櫃融資
        margin_rows_tpex = await chip_worker.fetch_mi_margn(d, market="tpex")
        if margin_rows_tpex:
            updated = await chip_worker.update_margin_data(d, margin_rows_tpex)
            logger.info(f"  {d}: MI_MARGN[上櫃] {len(margin_rows_tpex)} 檔，更新 {updated} 筆")
        await asyncio.sleep(3)

    logger.info(f"籌碼回補完成: 共 {total} 筆")
    return total
