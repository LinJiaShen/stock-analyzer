"""
AI 自動模擬交易 Worker

設計目的：讓 AI 策略自己挑股、設定目標價位，盤中自動模擬買賣，累積勝率統計。

兩個核心函式：
- auto_pick_and_open()：策略選股（波動度+突破篩選）→ 多因子評分過濾
  → 以 ATR 計算進場/停利/停損 → 自動建立模擬單
- check_triggers()：盤中每 5 分鐘抓現價（Sinopac snapshot，fallback 最新日K收盤）
  → 觸發 TP/SL 自動成交 → 更新已實現損益與勝率

數量單位 = 張，損益 = 元。
"""
import asyncio
import logging
from datetime import datetime, time as dtime

from sqlalchemy import select

from app.database import async_session_factory
from app.models.paper_trade import PaperTrade
from app.models.user import User
from app.models.daily_bar import DailyBar

logger = logging.getLogger(__name__)

SHARES_PER_LOT = 1000

# AI 策略參數（中期波段：波動夠大才有肉、流動性夠才進得去出得來）
STRATEGY_NAME = "AI波段·中波動突破"
MIN_SCORE = 52          # 綜合評分門檻
MAX_POSITIONS = 5       # 同時最多持倉數
ATR_PCT_RANGE = (2.5, 9.0)
ADTV_MIN = 2000         # 10日均量下限（張）
QTY_PER_TRADE = 1       # 每筆 1 張


def _is_market_hours() -> bool:
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    return dtime(9, 0) <= now.time() <= dtime(13, 30)


async def _get_dev_user_id():
    """自動交易掛在 dev 帳號下（開發環境的 AI 策略帳戶）"""
    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.username == "dev"))
        user = result.scalar_one_or_none()
        return user.id if user else None


async def _get_live_prices(stock_codes: list[str]) -> dict[str, float]:
    """
    批量取得現價。

    優先 Sinopac snapshots（盤中即時），失敗時 fallback 到 DB 最新日K收盤。
    """
    prices: dict[str, float] = {}

    # 1. Sinopac 即時快照（worker 進程未連線時自行登入一次）
    try:
        from worker.sinopac_worker import sinopac_service, run_in_executor
        if not sinopac_service.is_connected:
            from app.config import settings
            if settings.SINOPAC_API_KEY:
                await run_in_executor(
                    sinopac_service.connect_and_login,
                    settings.SINOPAC_API_KEY,
                    settings.SINOPAC_SECRET_KEY,
                )
        if sinopac_service.is_connected and sinopac_service._contracts_ready.is_set():
            contracts = []
            valid_codes = []
            for code in stock_codes:
                c = sinopac_service.api.Contracts.Stocks.get(code)
                if c:
                    contracts.append(c)
                    valid_codes.append(code)
            if contracts:
                snapshots = await run_in_executor(sinopac_service.api.snapshots, contracts)
                for snap in snapshots:
                    code = getattr(snap, "code", None)
                    close = getattr(snap, "close", None)
                    if code and close:
                        prices[str(code)] = float(close)
    except Exception as e:
        logger.warning(f"Sinopac snapshot 失敗，fallback 日K: {e}")

    # 2. DB fallback
    missing = [c for c in stock_codes if c not in prices]
    if missing:
        async with async_session_factory() as session:
            for code in missing:
                result = await session.execute(
                    select(DailyBar.close_price)
                    .where(DailyBar.stock_code == code)
                    .order_by(DailyBar.trade_date.desc())
                    .limit(1)
                )
                row = result.scalar_one_or_none()
                if row:
                    prices[code] = float(row)

    return prices


async def auto_pick_and_open(max_new: int = 3) -> dict:
    """
    AI 策略自動選股開倉

    流程：篩選候選（波動度/流動性）→ 多因子評分 → 取 operation 價位
    → 建立模擬單（進場=現價、TP1=壓力目標、SL1=ATR 停損）
    """
    from app.database import async_session_factory
    from app.services.scoring import ScoringService

    user_id = await _get_dev_user_id()
    if not user_id:
        return {"error": "dev 使用者不存在"}

    async with async_session_factory() as session:
        # 現有未平倉的股票（不重複開倉）
        open_res = await session.execute(
            select(PaperTrade.stock_code).where(
                PaperTrade.user_id == user_id,
                PaperTrade.status.in_(["open", "partial"]),
            )
        )
        held = {r for (r,) in open_res.all()}
        slots = MAX_POSITIONS - len(held)
        if slots <= 0:
            return {"opened": [], "message": f"持倉已滿（{len(held)}/{MAX_POSITIONS}）"}

        # 候選：用篩選器邏輯（波動度 + 流動性）
        from app.routers.stocks import screen_stocks
        screen = await screen_stocks(
            rsi_min=35, rsi_max=75,           # 避開極端超買超賣
            foreign_consecutive_buy=0,
            atr_pct_min=ATR_PCT_RANGE[0], atr_pct_max=ATR_PCT_RANGE[1],
            adtv_min=ADTV_MIN, price_max=0,
            breakout_bars=0, limit=20,
            db=session,
        )
        candidates = [c for c in screen["results"] if c["code"] not in held]

        # 多因子評分過濾 + 開倉
        scoring = ScoringService(session)
        opened = []
        from app.models.stock import Stock

        for cand in candidates:
            if len(opened) >= min(slots, max_new):
                break
            try:
                score = await scoring.calculate_composite_score(cand["code"])
            except Exception:
                continue

            total = score.get("total_score") or 0
            op = score.get("operation")
            if total < MIN_SCORE or not op:
                continue

            name_res = await session.execute(select(Stock.name).where(Stock.code == cand["code"]))
            stock_name = name_res.scalar_one_or_none() or cand["code"]

            entry = score.get("current_price")
            trade = PaperTrade(
                user_id=user_id,
                strategy=STRATEGY_NAME,
                stock_code=cand["code"],
                stock_name=stock_name,
                entry_price=entry,
                quantity=QTY_PER_TRADE,
                remaining_quantity=QTY_PER_TRADE,
                exits=[
                    {"type": "tp", "seq": 1, "price": op["target"], "quantity": QTY_PER_TRADE},
                    {"type": "sl", "seq": 1, "price": op["stop_loss"], "quantity": QTY_PER_TRADE},
                ],
                note=f"AI 自動開倉｜評分 {total}｜ATR {score.get('atr_14')}｜風報比 1:{op['rr_ratio']}",
                status="open",
            )
            session.add(trade)
            opened.append({
                "code": cand["code"], "name": stock_name, "entry": entry,
                "tp": op["target"], "sl": op["stop_loss"], "score": total,
            })
            logger.info(f"AI 開倉 {cand['code']} {stock_name}: 進場 {entry}, TP {op['target']}, SL {op['stop_loss']}（評分 {total}）")

        await session.commit()
        return {"opened": opened, "held": len(held) + len(opened), "max": MAX_POSITIONS}


async def check_triggers() -> dict:
    """
    盤中觸發檢查：現價 >= TP 觸發停利、<= SL 觸發停損，以計畫價成交。
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(PaperTrade).where(PaperTrade.status.in_(["open", "partial"]))
        )
        trades = result.scalars().all()
        if not trades:
            return {"checked": 0, "filled": []}

        codes = list({t.stock_code for t in trades})
        prices = await _get_live_prices(codes)

        filled = []
        now_iso = datetime.now().isoformat()

        for trade in trades:
            price = prices.get(trade.stock_code)
            if not price:
                continue

            remaining = int(trade.remaining_quantity)
            exits = list(trade.exits or [])
            changed = False

            for e in exits:
                if e.get("filled_time") or remaining <= 0:
                    continue
                etype, eprice = e.get("type"), float(e.get("price") or 0)
                qty = min(int(e.get("quantity") or 0), remaining)
                if qty <= 0 or eprice <= 0:
                    continue

                triggered = (etype == "tp" and price >= eprice) or (etype == "sl" and price <= eprice)
                if not triggered:
                    continue

                # 以計畫價成交（保守估計）
                e["filled_time"] = now_iso
                e["filled_price"] = eprice
                pnl = (eprice - float(trade.entry_price)) * qty * SHARES_PER_LOT
                trade.realized_pnl = float(trade.realized_pnl) + pnl
                remaining -= qty
                changed = True
                filled.append({
                    "code": trade.stock_code, "type": etype, "price": eprice,
                    "qty": qty, "pnl": round(pnl),
                })
                logger.info(f"觸發 {etype.upper()} {trade.stock_code} @{eprice}（現價 {price}）損益 {pnl:+.0f}")

            if changed:
                from sqlalchemy.orm.attributes import flag_modified
                trade.exits = exits
                flag_modified(trade, "exits")
                trade.remaining_quantity = remaining
                if remaining == 0:
                    trade.status = "closed"
                    trade.closed_at = datetime.now()
                else:
                    trade.status = "partial"

        await session.commit()
        return {"checked": len(trades), "prices": len(prices), "filled": filled}


async def intraday_trigger_job():
    """排程任務：每 5 分鐘檢查 TP/SL 觸發（只要有持倉就監控，不受營業時間限制）"""
    from app.database import async_session_factory
    from app.models.paper_trade import PaperTrade
    from sqlalchemy import select

    # 先檢查是否有未平倉的持倉
    async with async_session_factory() as session:
        open_count = (await session.execute(
            select(PaperTrade).where(PaperTrade.status.in_(["open", "partial"]))
        )).scalars().all()

    # 有持倉才執行檢查（避免盤後每 5 分鐘白跑一遍）
    if not open_count:
        return

    result = await check_triggers()
    if result.get("filled"):
        logger.info(f"模擬單觸發成交: {result['filled']}")


async def daily_auto_pick_job():
    """排程任務：每交易日 09:15 AI 自動選股開倉"""
    if datetime.now().weekday() >= 5:
        return
    result = await auto_pick_and_open()
    logger.info(f"AI 自動選股: {result}")
