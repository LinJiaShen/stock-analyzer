"""
月營收 Worker

抓 TWSE（上市）+ TPEx（上櫃）MOPS 月營收彙總表，每月一筆 upsert。
資料已含 YoY/MoM/累計年增率。資料年月為民國年月（11505 → 2026-05），單位千元。
"""
import logging
from datetime import date

import httpx
from sqlalchemy import select, text

from app.database import async_session_factory

logger = logging.getLogger(__name__)

SOURCES = [
    ("twse", "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"),
    ("tpex", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"),
]


def _roc_month(s: str) -> date | None:
    """民國年月字串 '11505' → date(2026, 5, 1)。"""
    s = (s or "").strip()
    if len(s) < 5 or not s.isdigit():
        return None
    try:
        return date(int(s[:-2]) + 1911, int(s[-2:]), 1)
    except ValueError:
        return None


def _num(v):
    s = str(v).replace(",", "").strip() if v is not None else ""
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


class MonthlyRevenueWorker:
    async def fetch(self) -> list[dict]:
        rows: list[dict] = []
        for market, url in SOURCES:
            try:
                async with httpx.AsyncClient(timeout=60.0, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }) as client:
                    res = await client.get(url)
                    if res.status_code != 200:
                        logger.warning(f"月營收[{market}] 回應異常: {res.status_code}")
                        continue
                    data = res.json()
            except Exception as e:
                logger.warning(f"月營收[{market}] 抓取失敗: {e}")
                continue

            for it in data:
                month = _roc_month(it.get("資料年月"))
                code = (it.get("公司代號") or "").strip()
                if not month or not code:
                    continue
                rows.append({
                    "stock_code": code,
                    "revenue_month": month,
                    "revenue": _num(it.get("營業收入-當月營收")),
                    "mom_pct": _num(it.get("營業收入-上月比較增減(%)")),
                    "yoy_pct": _num(it.get("營業收入-去年同月增減(%)")),
                    "cum_revenue": _num(it.get("累計營業收入-當月累計營收")),
                    "cum_yoy_pct": _num(it.get("累計營業收入-前期比較增減(%)")),
                })
        return rows

    async def save(self, rows: list[dict]) -> int:
        if not rows:
            return 0
        from app.models.stock import Stock
        async with async_session_factory() as session:
            valid = {r for (r,) in (await session.execute(select(Stock.code))).all()}
            stmt = text("""
                INSERT INTO stock_monthly_revenue
                    (stock_code, revenue_month, revenue, mom_pct, yoy_pct, cum_revenue, cum_yoy_pct)
                VALUES (:code, :m, :rev, :mom, :yoy, :cum, :cumyoy)
                ON CONFLICT (stock_code, revenue_month) DO UPDATE SET
                    revenue=EXCLUDED.revenue, mom_pct=EXCLUDED.mom_pct, yoy_pct=EXCLUDED.yoy_pct,
                    cum_revenue=EXCLUDED.cum_revenue, cum_yoy_pct=EXCLUDED.cum_yoy_pct
            """)
            saved = 0
            for r in rows:
                if r["stock_code"] not in valid:
                    continue
                await session.execute(stmt, {
                    "code": r["stock_code"], "m": r["revenue_month"], "rev": r["revenue"],
                    "mom": r["mom_pct"], "yoy": r["yoy_pct"],
                    "cum": r["cum_revenue"], "cumyoy": r["cum_yoy_pct"],
                })
                saved += 1
            await session.commit()
            return saved


monthly_revenue_worker = MonthlyRevenueWorker()


async def fetch_monthly_revenue() -> dict:
    """定時任務：抓取最新月營收（上市 + 上櫃）。"""
    logger.info("開始抓取月營收...")
    rows = await monthly_revenue_worker.fetch()
    saved = await monthly_revenue_worker.save(rows)
    logger.info(f"月營收完成: 解析 {len(rows)}，存 {saved}")
    return {"parsed": len(rows), "saved": saved}
