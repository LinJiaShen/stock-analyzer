"""
自訂預警掃描 Worker

盤後（chip 18:30 後）掃描所有啟用的 alert_rules，比對最新行情/籌碼，
觸發則寫 notifications（type=alert）。每規則每日最多觸發一次（last_triggered_at 去抖）。
"""
import logging
from datetime import date, datetime

from sqlalchemy import select

from app.database import async_session_factory

logger = logging.getLogger(__name__)


def evaluate_rule(rule_type: str, params: dict, closes: list, vols: list, foreign_streak: int) -> str | None:
    """回傳觸發訊息（中文），未觸發回 None。closes 為還原收盤、舊→新。"""
    if len(closes) < 2:
        return None
    p = params or {}
    last, prev = closes[-1], closes[-2]

    if rule_type == "price_above":
        thr = float(p.get("threshold", 0))
        if thr and last >= thr and prev < thr:
            return f"突破價格 {thr}（現價 {round(last, 2)}）"
    elif rule_type == "price_below":
        thr = float(p.get("threshold", 0))
        if thr and last <= thr and prev > thr:
            return f"跌破價格 {thr}（現價 {round(last, 2)}）"
    elif rule_type == "breakout":
        n = int(p.get("lookback", 20))
        if len(closes) > n:
            window = closes[-n - 1:-1]
            if window and last >= max(window) and last > prev:
                return f"創 {n} 日新高（{round(last, 2)}）"
    elif rule_type == "volume_spike":
        n = int(p.get("lookback", 20))
        m = float(p.get("multiplier", 1.5))
        if len(vols) > n:
            avg = sum(vols[-n - 1:-1]) / n
            if avg > 0 and vols[-1] > avg * m:
                return f"爆量 {round(vols[-1] / avg, 1)}× 均量"
    elif rule_type == "ma_break_below":
        n = int(p.get("ma", 20))
        if len(closes) > n:
            ma = sum(closes[-n:]) / n
            prev_ma = sum(closes[-n - 1:-1]) / n
            if prev >= prev_ma and last < ma:
                return f"跌破 {n} 日均線（{round(ma, 2)}）"
    elif rule_type == "ma_break_above":
        n = int(p.get("ma", 20))
        if len(closes) > n:
            ma = sum(closes[-n:]) / n
            prev_ma = sum(closes[-n - 1:-1]) / n
            if prev <= prev_ma and last > ma:
                return f"站上 {n} 日均線（{round(ma, 2)}）"
    elif rule_type == "foreign_streak":
        d = int(p.get("days", 3))
        if foreign_streak >= d:
            return f"外資連買 {foreign_streak} 天"
    return None


async def scan_alerts() -> dict:
    """掃描所有啟用規則，觸發則寫通知。"""
    from app.models.alert_rule import AlertRule
    from app.models.notification import Notification
    from app.models.daily_bar import DailyBar, ChipData

    async with async_session_factory() as session:
        rules = (await session.execute(
            select(AlertRule).where(AlertRule.enabled == True)  # noqa: E712
        )).scalars().all()
        if not rules:
            return {"scanned": 0, "triggered": 0}

        codes = {r.stock_code for r in rules}
        bars_map: dict[str, tuple] = {}
        streak_map: dict[str, int] = {}
        for code in codes:
            rows = (await session.execute(
                select(DailyBar.adjusted_close, DailyBar.close_price, DailyBar.volume)
                .where(DailyBar.stock_code == code)
                .order_by(DailyBar.trade_date.desc()).limit(120)
            )).all()
            rows = list(reversed(rows))
            closes = [float(r[0] or r[1] or 0) for r in rows]
            vols = [float(r[2] or 0) for r in rows]
            bars_map[code] = (closes, vols)

            chip = (await session.execute(
                select(ChipData.foreign_net).where(ChipData.stock_code == code)
                .order_by(ChipData.trade_date.desc()).limit(30)
            )).all()
            streak = 0
            for (fn,) in chip:
                if fn and float(fn) > 0:
                    streak += 1
                else:
                    break
            streak_map[code] = streak

        today = date.today()
        triggered = 0
        for r in rules:
            if r.last_triggered_at and r.last_triggered_at.date() == today:
                continue  # 每日最多觸發一次
            closes, vols = bars_map.get(r.stock_code, ([], []))
            msg = evaluate_rule(r.rule_type, r.params, closes, vols, streak_map.get(r.stock_code, 0))
            if msg:
                label = r.stock_name or r.stock_code
                session.add(Notification(
                    user_id=r.user_id, type="alert",
                    message=f"⚡ {r.stock_code} {label}：{msg}",
                ))
                r.last_triggered_at = datetime.now()
                triggered += 1

        await session.commit()
        return {"scanned": len(rules), "triggered": triggered}


async def alert_scan_job():
    """排程任務：每交易日盤後掃描預警。"""
    if datetime.now().weekday() >= 5:
        return
    result = await scan_alerts()
    if result.get("triggered"):
        logger.info(f"預警觸發: {result}")
