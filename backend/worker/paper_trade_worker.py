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
from app.models.paper_account import PaperAccount
from app.models.user import User
from app.models.daily_bar import DailyBar
from app.services.trading_costs import net_realized_pnl, round_trip_fee

logger = logging.getLogger(__name__)

SHARES_PER_LOT = 1000

# AI 策略參數（中期波段：波動夠大才有肉、流動性夠才進得去出得來）
STRATEGY_NAME = "AI波段·中波動突破"
MIN_SCORE = 52          # 綜合評分門檻
MAX_POSITIONS = 5       # 同時最多持倉數
ATR_PCT_RANGE = (2.5, 9.0)
ADTV_MIN = 2000         # 10日均量下限（張）
QTY_PER_TRADE = 1       # 每筆 1 張


async def _notify(session, user_id, ntype: str, message: str):
    """寫入站內通知（與呼叫端共用 session，於同一 commit 落地）。"""
    from app.models.notification import Notification
    session.add(Notification(user_id=user_id, type=ntype, message=message))


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


async def auto_pick_and_open(user_id=None, max_new: int = 3, respect_mode: bool = True) -> dict:
    """
    AI 策略自動選股開倉（單一帳戶）

    流程：模式檢查 → 風控閘門 → 篩選候選（波動度/流動性）→ 多因子評分
    → 依風險% 動態計算張數 → 建立模擬單（進場=現價、TP1=壓力目標、SL1=ATR 停損）

    user_id=None 時掛在 dev 帳號（向後相容）。
    respect_mode=True（排程用）：auto→直接開倉、semi→建立 proposed 待確認、off→跳過。
    respect_mode=False（手動「AI 選股開倉」）：使用者明確要求，一律直接開倉（仍套用風控與部位上限）。
    """
    from app.database import async_session_factory
    from app.services.scoring import ScoringService
    from app.services import risk

    if user_id is None:
        user_id = await _get_dev_user_id()
    if not user_id:
        return {"error": "dev 使用者不存在"}

    async with async_session_factory() as session:
        # 帳戶與風控參數
        acc_res = await session.execute(
            select(PaperAccount).where(PaperAccount.user_id == user_id)
        )
        account = acc_res.scalar_one_or_none()
        if not account:
            account = PaperAccount(user_id=user_id)
            session.add(account)
            await session.commit()
            await session.refresh(account)

        # 模式：off→不自動開倉；semi→建立待確認(proposed)；auto→直接開倉
        if respect_mode and account.auto_trade_mode == "off":
            return {"opened": [], "message": "自動交易模式為「off」，未啟用", "mode": "off"}
        new_status = "proposed" if (respect_mode and account.auto_trade_mode == "semi") else "open"

        # 全部模擬單（供風控閘門與現金計算）
        all_res = await session.execute(
            select(PaperTrade).where(PaperTrade.user_id == user_id)
        )
        all_trades = all_res.scalars().all()

        # 風控閘門：每日虧損熔斷 / 連敗暫停 / 持倉數上限
        gate = risk.evaluate_auto_gates(account, all_trades, datetime.now().date())
        if not gate["allowed"]:
            logger.info(f"AI 自動開倉被風控擋下: {gate['reasons']}")
            await _notify(session, user_id, "blocked", "AI 風控暫停開倉：" + "；".join(gate["reasons"]))
            await session.commit()
            return {"opened": [], "blocked": True, "reasons": gate["reasons"]}

        held = {t.stock_code for t in all_trades if t.status in ("open", "partial")}
        slots = int(account.max_positions) - len(held)
        if slots <= 0:
            return {"opened": [], "message": f"持倉已滿（{len(held)}/{account.max_positions}）"}

        # 現金面（結算權益 = 本金 + 已實現；可用現金 = 權益 − 已投入成本）
        capital = float(account.initial_capital)
        realized = sum(float(t.realized_pnl) for t in all_trades)
        deployed = sum(
            float(t.entry_price) * int(t.remaining_quantity) * SHARES_PER_LOT
            for t in all_trades if t.status != "closed"
        )
        equity = capital + realized
        available = capital + realized - deployed

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

        # 多因子評分過濾 + 動態部位開倉
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

            entry = score.get("current_price")
            if not entry or not op.get("stop_loss"):
                continue

            # 動態部位：依風險% + 單一持股上限 + 可用現金 計算張數
            lots = risk.position_size(
                equity, float(account.risk_per_trade_pct),
                float(entry), float(op["stop_loss"]),
                float(account.max_position_pct), available,
            )
            if lots < 1:
                continue

            name_res = await session.execute(select(Stock.name).where(Stock.code == cand["code"]))
            stock_name = name_res.scalar_one_or_none() or cand["code"]

            # 決策快照：開倉當下的評分分項與操作參數（決策日誌）
            conf = score.get("confidence") or {}
            decision_snapshot = {
                "total": total,
                "technical": score.get("technical_score"),
                "chip": score.get("chip_score"),
                "fundamental": score.get("fundamental_score"),
                "sentiment": score.get("sentiment_score"),
                "pattern": score.get("pattern_norm"),
                "atr_14": score.get("atr_14"),
                "rr_ratio": op.get("rr_ratio"),
                "target": op.get("target"),
                "stop_loss": op.get("stop_loss"),
                "confidence": conf.get("level"),
                "health": score.get("health_level"),
                "entry": entry,
                "decided_at": datetime.now().isoformat(),
            }

            trade = PaperTrade(
                user_id=user_id,
                strategy=STRATEGY_NAME,
                stock_code=cand["code"],
                stock_name=stock_name,
                entry_price=entry,
                quantity=lots,
                remaining_quantity=lots,
                exits=[
                    {"type": "tp", "seq": 1, "price": op["target"], "quantity": lots},
                    {"type": "sl", "seq": 1, "price": op["stop_loss"], "quantity": lots},
                ],
                note=f"AI {'建議' if new_status == 'proposed' else '自動開倉'}｜評分 {total}｜ATR {score.get('atr_14')}｜風報比 1:{op['rr_ratio']}｜{lots} 張",
                decision_snapshot=decision_snapshot,
                status=new_status,
            )
            session.add(trade)
            # proposed 不佔用現金；open 才扣可用現金供下一筆判斷
            if new_status == "open":
                available -= float(entry) * lots * SHARES_PER_LOT
            opened.append({
                "code": cand["code"], "name": stock_name, "entry": entry,
                "tp": op["target"], "sl": op["stop_loss"], "score": total, "qty": lots,
                "status": new_status,
            })
            logger.info(f"AI 開倉 {cand['code']} {stock_name}: {lots} 張 進場 {entry}, TP {op['target']}, SL {op['stop_loss']}（評分 {total}）")

        if opened:
            verb = "建議" if new_status == "proposed" else "自動開倉"
            await _notify(
                session, user_id, new_status,
                f"AI {verb} {len(opened)} 筆：" + "、".join(f"{o['code']} {o['qty']}張" for o in opened),
            )
        await session.commit()
        return {
            "opened": opened, "held": len(held) + len(opened),
            "max": int(account.max_positions), "mode": account.auto_trade_mode,
        }


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

        # 各帳戶手續費折數（計算淨損益用）
        user_ids = {t.user_id for t in trades}
        acc_res = await session.execute(
            select(PaperAccount).where(PaperAccount.user_id.in_(user_ids))
        )
        discount_map = {a.user_id: float(a.fee_discount) for a in acc_res.scalars().all()}

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

                # 以計畫價成交（保守估計），扣除手續費 + 證交稅
                e["filled_time"] = now_iso
                e["filled_price"] = eprice
                pnl = net_realized_pnl(float(trade.entry_price), eprice, qty, discount_map.get(trade.user_id, 1.0))
                trade.realized_pnl = float(trade.realized_pnl) + pnl
                remaining -= qty
                changed = True
                filled.append({
                    "code": trade.stock_code, "type": etype, "price": eprice,
                    "qty": qty, "pnl": round(pnl),
                })
                logger.info(f"觸發 {etype.upper()} {trade.stock_code} @{eprice}（現價 {price}）損益 {pnl:+.0f}")
                await _notify(session, trade.user_id, "fill",
                              f"{etype.upper()} 成交 {trade.stock_code} @{eprice}，損益 {round(pnl):+}")

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
    """排程任務：每交易日 09:15，對所有啟用自動交易（mode != off）的帳戶選股開倉/建議。"""
    if datetime.now().weekday() >= 5:
        return
    async with async_session_factory() as session:
        res = await session.execute(
            select(PaperAccount.user_id).where(PaperAccount.auto_trade_mode != "off")
        )
        user_ids = [r for (r,) in res.all()]
    if not user_ids:
        logger.info("AI 自動選股：無啟用自動交易（mode != off）的帳戶")
        return
    for uid in user_ids:
        result = await auto_pick_and_open(uid, respect_mode=True)
        logger.info(f"AI 自動選股 user={uid}: {result}")


async def _account_equity(session, account) -> float:
    """帳戶權益 = 本金 + 已實現 + 未實現（open/partial，以最新收盤扣來回成本）。"""
    res = await session.execute(select(PaperTrade).where(PaperTrade.user_id == account.user_id))
    trades = res.scalars().all()
    realized = sum(float(t.realized_pnl) for t in trades if t.status != "proposed")
    discount = float(account.fee_discount)
    unreal = 0.0
    for t in trades:
        if t.status in ("open", "partial"):
            rem = int(t.remaining_quantity)
            if rem <= 0:
                continue
            row = (await session.execute(
                select(DailyBar.close_price, DailyBar.adjusted_close)
                .where(DailyBar.stock_code == t.stock_code)
                .order_by(DailyBar.trade_date.desc()).limit(1)
            )).first()
            if row:
                latest = float(row[1] or row[0] or 0)
                if latest:
                    gross = (latest - float(t.entry_price)) * rem * SHARES_PER_LOT
                    unreal += gross - round_trip_fee(float(t.entry_price), latest, rem, discount)
    return float(account.initial_capital) + realized + unreal


async def snapshot_all_equity() -> dict:
    """為所有模擬帳戶寫入今日權益快照（每帳戶每日一筆，upsert）。"""
    from datetime import date
    from app.models.paper_account import PaperAccount
    from app.models.paper_equity_snapshot import PaperEquitySnapshot
    today = date.today()
    count = 0
    async with async_session_factory() as session:
        accounts = (await session.execute(select(PaperAccount))).scalars().all()
        for acc in accounts:
            equity = round(await _account_equity(session, acc))
            existing = (await session.execute(
                select(PaperEquitySnapshot).where(
                    PaperEquitySnapshot.user_id == acc.user_id,
                    PaperEquitySnapshot.snapshot_date == today,
                )
            )).scalar_one_or_none()
            if existing:
                existing.equity = equity
            else:
                session.add(PaperEquitySnapshot(user_id=acc.user_id, snapshot_date=today, equity=equity))
            count += 1
        await session.commit()
    return {"snapshots": count, "date": today.isoformat()}


async def daily_equity_snapshot_job():
    """排程任務：每交易日收盤後（18:10）記錄各帳戶權益快照。"""
    if datetime.now().weekday() >= 5:
        return
    result = await snapshot_all_equity()
    logger.info(f"權益快照: {result}")
