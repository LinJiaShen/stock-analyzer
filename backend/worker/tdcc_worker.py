"""
TDCC 集保大戶持股 Worker

抓 TDCC OpenData 股權分散表（getOD.ashx?id=1-5，每週一次、全市場），
把 17 個持股分級 bucket 成大戶持股比：
- 400 張以上（≥400,001 股）= 分級 12–15
- 1000 張以上（≥1,000,001 股，千張大戶）= 分級 15
- float_shares = 分級 17（集保庫存合計股數）

ratio 以「占集保庫存比例」存為分數（0–1，fit Numeric(5,4)）。
每股票每週一筆，以 (stock_code, week_date) upsert。資料約 2MB / 6.7 萬列。
"""
import csv
import io
import logging
from datetime import date, datetime

import httpx
from sqlalchemy import select, text

from app.database import async_session_factory
from app.utils.cache import Cache

logger = logging.getLogger(__name__)

TDCC_URL = "https://opendata.tdcc.com.tw/getOD.ashx?id=1-5"

LEVELS_400 = {12, 13, 14, 15}  # ≥400,001 股（≥400 張）
LEVEL_1000 = 15                # ≥1,000,001 股（千張大戶）
LEVEL_TOTAL = 17               # 合計


def _num(v) -> float:
    try:
        return float(str(v).replace(",", "").strip() or 0)
    except (ValueError, TypeError):
        return 0.0


class TDCCWorker:
    def __init__(self):
        self.cache = Cache()

    async def fetch_distribution(self) -> tuple[date | None, dict]:
        """抓最新一週全市場股權分散表 → (week_date, {code: 累積 bucket})。"""
        try:
            async with httpx.AsyncClient(timeout=120.0, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }) as client:
                res = await client.get(TDCC_URL)
                if res.status_code != 200:
                    logger.warning(f"TDCC 回應異常: {res.status_code}")
                    return None, {}
                content = res.text
        except Exception as e:
            logger.warning(f"TDCC 抓取失敗: {e}")
            return None, {}

        reader = csv.reader(io.StringIO(content))
        next(reader, None)  # 表頭
        stocks: dict[str, dict] = {}
        week_date = None
        for row in reader:
            if len(row) < 6:
                continue
            d_str, code, level_str = row[0].strip(), row[1].strip(), row[2].strip()
            if not code or not level_str.isdigit():
                continue
            if week_date is None:
                try:
                    week_date = datetime.strptime(d_str, "%Y%m%d").date()
                except ValueError:
                    pass
            level = int(level_str)
            s = stocks.setdefault(code, {
                "h400_c": 0, "h400_s": 0.0, "h400_r": 0.0,
                "h1000_c": 0, "h1000_s": 0.0, "h1000_r": 0.0, "total_s": 0.0,
            })
            holders, shares, ratio = int(_num(row[3])), _num(row[4]), _num(row[5])
            if level in LEVELS_400:
                s["h400_c"] += holders
                s["h400_s"] += shares
                s["h400_r"] += ratio
            if level == LEVEL_1000:
                s["h1000_c"] += holders
                s["h1000_s"] += shares
                s["h1000_r"] += ratio
            if level == LEVEL_TOTAL:
                s["total_s"] = shares
        return week_date, stocks

    async def save(self, week_date: date, stocks: dict) -> int:
        """upsert 至 tdcc_holder_data（僅 DB 已存在的股票）。"""
        if not week_date or not stocks:
            return 0
        from app.models.stock import Stock
        async with async_session_factory() as session:
            valid = {r for (r,) in (await session.execute(select(Stock.code))).all()}
            stmt = text("""
                INSERT INTO tdcc_holder_data
                    (stock_code, week_date, holder_400_count, holder_400_shares, holder_400_ratio,
                     holder_1000_count, holder_1000_shares, holder_1000_ratio, float_shares)
                VALUES (:code, :wd, :h4c, :h4s, :h4r, :h1c, :h1s, :h1r, :tot)
                ON CONFLICT (stock_code, week_date) DO UPDATE SET
                    holder_400_count=EXCLUDED.holder_400_count,
                    holder_400_shares=EXCLUDED.holder_400_shares,
                    holder_400_ratio=EXCLUDED.holder_400_ratio,
                    holder_1000_count=EXCLUDED.holder_1000_count,
                    holder_1000_shares=EXCLUDED.holder_1000_shares,
                    holder_1000_ratio=EXCLUDED.holder_1000_ratio,
                    float_shares=EXCLUDED.float_shares
            """)
            saved = 0
            for code, s in stocks.items():
                if code not in valid:
                    continue
                await session.execute(stmt, {
                    "code": code, "wd": week_date,
                    "h4c": s["h400_c"], "h4s": s["h400_s"], "h4r": round(min(s["h400_r"], 100) / 100, 4),
                    "h1c": s["h1000_c"], "h1s": s["h1000_s"], "h1r": round(min(s["h1000_r"], 100) / 100, 4),
                    "tot": s["total_s"],
                })
                saved += 1
            await session.commit()
            return saved


tdcc_worker = TDCCWorker()


async def fetch_weekly_tdcc() -> dict:
    """定時任務：抓取最新一週 TDCC 集保大戶持股分布。"""
    logger.info("開始抓取 TDCC 集保大戶持股...")
    week_date, stocks = await tdcc_worker.fetch_distribution()
    if not week_date:
        logger.warning("TDCC 無資料")
        return {"saved": 0}
    saved = await tdcc_worker.save(week_date, stocks)
    logger.info(f"TDCC 完成: 週 {week_date}，解析 {len(stocks)} 檔，存 {saved} 筆")
    return {"week_date": week_date.isoformat(), "parsed": len(stocks), "saved": saved}
