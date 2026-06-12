"""
模擬單（Paper Trading）路由

- POST   /api/paper-trades/          建立模擬單（進場 + TP/SL 計畫）
- GET    /api/paper-trades/          列表（含即時未實現損益）
- POST   /api/paper-trades/{id}/fill 記錄出場成交（TP/SL 觸發或手動平倉）
- DELETE /api/paper-trades/{id}      刪除
- GET    /api/paper-trades/stats     統計（勝率/平均盈虧比/EV/總損益）

數量單位 = 張（1 張 = 1000 股），損益金額 = 元
"""
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models.user import User
from app.models.paper_trade import PaperTrade
from app.models.daily_bar import DailyBar
from app.utils.security import get_current_user

router = APIRouter(prefix="/api/paper-trades", tags=["模擬交易"])

SHARES_PER_LOT = 1000  # 1 張 = 1000 股


# ---------- Schemas ----------

class ExitPlan(BaseModel):
    type: str = Field(..., pattern="^(tp|sl)$", description="tp=停利, sl=停損")
    seq: int = Field(..., ge=1, le=3)
    price: float = Field(..., gt=0, description="計畫觸發價")
    quantity: int = Field(..., gt=0, description="張數")


class PaperTradeCreate(BaseModel):
    stock_code: str
    stock_name: Optional[str] = None
    strategy: Optional[str] = None
    entry_price: float = Field(..., gt=0)
    quantity: int = Field(..., gt=0, description="張數")
    exits: List[ExitPlan] = []
    note: Optional[str] = None


class FillRequest(BaseModel):
    type: str = Field(..., pattern="^(tp|sl|manual)$")
    seq: int = Field(1, ge=1, le=3)
    filled_price: float = Field(..., gt=0)
    quantity: int = Field(..., gt=0, description="張數")


# ---------- Helpers ----------

async def _latest_close(db: AsyncSession, stock_code: str) -> Optional[float]:
    """取最近可用收盤價"""
    stmt = (
        select(DailyBar)
        .where(DailyBar.stock_code == stock_code)
        .order_by(desc(DailyBar.trade_date))
        .limit(1)
    )
    result = await db.execute(stmt)
    bar = result.scalar_one_or_none()
    if not bar:
        return None
    return float(bar.adjusted_close or bar.close_price or 0) or None


def _serialize(trade: PaperTrade, latest_price: Optional[float]) -> dict:
    """組合回應，計算未實現/總損益"""
    entry_price = float(trade.entry_price)
    remaining = int(trade.remaining_quantity)
    realized = float(trade.realized_pnl)

    unrealized = None
    unrealized_pct = None
    if latest_price and remaining > 0:
        unrealized = round((latest_price - entry_price) * remaining * SHARES_PER_LOT, 0)
        unrealized_pct = round((latest_price - entry_price) / entry_price * 100, 2)

    total_cost = entry_price * int(trade.quantity) * SHARES_PER_LOT
    total_pnl = realized + (unrealized or 0)

    return {
        "id": str(trade.id),
        "strategy": trade.strategy,
        "stock_code": trade.stock_code,
        "stock_name": trade.stock_name,
        "entry_time": trade.entry_time.isoformat() if trade.entry_time else None,
        "entry_price": entry_price,
        "quantity": int(trade.quantity),
        "exits": trade.exits or [],
        "status": trade.status,
        "remaining_quantity": remaining,
        "latest_price": latest_price,
        "realized_pnl": realized,
        "realized_pnl_pct": round(realized / total_cost * 100, 2) if total_cost else 0,
        "unrealized_pnl": unrealized,
        "unrealized_pnl_pct": unrealized_pct,
        "total_pnl": round(total_pnl, 0),
        "total_pnl_pct": round(total_pnl / total_cost * 100, 2) if total_cost else 0,
        "total_cost": round(total_cost, 0),
        "note": trade.note,
        "closed_at": trade.closed_at.isoformat() if trade.closed_at else None,
    }


# ---------- Endpoints ----------

@router.get("/stats")
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    模擬交易統計

    勝率 = 已平倉獲利單 / 已平倉總單數
    平均盈虧比 = 平均獲利金額 / 平均虧損金額
    EV = 勝率 × 平均獲利 − (1−勝率) × 平均虧損
    """
    result = await db.execute(
        select(PaperTrade).where(PaperTrade.user_id == current_user.id)
    )
    trades = result.scalars().all()

    closed = [t for t in trades if t.status == "closed"]
    wins = [float(t.realized_pnl) for t in closed if float(t.realized_pnl) > 0]
    losses = [abs(float(t.realized_pnl)) for t in closed if float(t.realized_pnl) < 0]

    win_rate = len(wins) / len(closed) if closed else 0
    avg_win = sum(wins) / len(wins) if wins else 0
    avg_loss = sum(losses) / len(losses) if losses else 0
    rr_ratio = round(avg_win / avg_loss, 2) if avg_loss else None
    ev = round(win_rate * avg_win - (1 - win_rate) * avg_loss, 0) if closed else 0

    total_cost = sum(float(t.entry_price) * int(t.quantity) * SHARES_PER_LOT for t in trades)
    realized_total = sum(float(t.realized_pnl) for t in trades)

    # 未實現損益（持倉中的）
    unrealized_total = 0.0
    for t in trades:
        if int(t.remaining_quantity) > 0:
            latest = await _latest_close(db, t.stock_code)
            if latest:
                unrealized_total += (latest - float(t.entry_price)) * int(t.remaining_quantity) * SHARES_PER_LOT

    return {
        "total_trades": len(trades),
        "open_trades": len([t for t in trades if t.status != "closed"]),
        "closed_trades": len(closed),
        "win_rate": round(win_rate * 100, 2),
        "avg_win": round(avg_win, 0),
        "avg_loss": round(avg_loss, 0),
        "rr_ratio": rr_ratio,
        "ev": ev,
        "total_cost": round(total_cost, 0),
        "realized_pnl": round(realized_total, 0),
        "unrealized_pnl": round(unrealized_total, 0),
        "total_pnl": round(realized_total + unrealized_total, 0),
    }


@router.post("/auto-pick")
async def trigger_auto_pick(
    current_user: User = Depends(get_current_user),
):
    """
    AI 自動選股開倉（手動觸發）

    策略：波動度 2.5–9% + 流動性 2000張 + 多因子評分 ≥ 52
    → 以 ATR 計算進場/TP/SL 自動建立模擬單（最多同時 5 倉）
    """
    from worker.paper_trade_worker import auto_pick_and_open
    result = await auto_pick_and_open()
    return result


@router.post("/check-triggers")
async def trigger_check(
    current_user: User = Depends(get_current_user),
):
    """手動觸發 TP/SL 檢查（盤中排程每 5 分鐘自動執行）"""
    from worker.paper_trade_worker import check_triggers
    result = await check_triggers()
    return result


@router.get("/")
async def list_paper_trades(
    status_filter: str = Query("all", alias="status", description="all / open / partial / closed"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """模擬單列表（含即時損益）"""
    stmt = select(PaperTrade).where(PaperTrade.user_id == current_user.id)
    if status_filter != "all":
        stmt = stmt.where(PaperTrade.status == status_filter)
    stmt = stmt.order_by(desc(PaperTrade.entry_time))

    result = await db.execute(stmt)
    trades = result.scalars().all()

    items = []
    price_cache: dict = {}
    for t in trades:
        if t.stock_code not in price_cache:
            price_cache[t.stock_code] = await _latest_close(db, t.stock_code)
        items.append(_serialize(t, price_cache[t.stock_code]))

    return {"trades": items, "total": len(items)}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_paper_trade(
    data: PaperTradeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """建立模擬單（進場 + TP/SL 出場計畫）"""
    # TP 與 SL 為替代計畫（OCO），各自加總不可超過進場張數
    tp_qty = sum(e.quantity for e in data.exits if e.type == "tp")
    sl_qty = sum(e.quantity for e in data.exits if e.type == "sl")
    if tp_qty > data.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"停利計畫總張數 ({tp_qty}) 不可超過進場張數 ({data.quantity})"
        )
    if sl_qty > data.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"停損計畫總張數 ({sl_qty}) 不可超過進場張數 ({data.quantity})"
        )

    trade = PaperTrade(
        user_id=current_user.id,
        strategy=data.strategy,
        stock_code=data.stock_code,
        stock_name=data.stock_name,
        entry_price=data.entry_price,
        quantity=data.quantity,
        remaining_quantity=data.quantity,
        exits=[e.model_dump() for e in data.exits],
        note=data.note,
        status="open",
    )
    db.add(trade)
    await db.commit()
    await db.refresh(trade)

    latest = await _latest_close(db, trade.stock_code)
    return _serialize(trade, latest)


@router.post("/{trade_id}/fill")
async def fill_exit(
    trade_id: UUID,
    fill: FillRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    記錄出場成交

    - type=tp/sl + seq：對應出場計畫的成交（標記 filled）
    - type=manual：手動平倉（不對應計畫）
    """
    result = await db.execute(
        select(PaperTrade).where(
            PaperTrade.id == trade_id,
            PaperTrade.user_id == current_user.id,
        )
    )
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="找不到該模擬單")

    remaining = int(trade.remaining_quantity)
    if fill.quantity > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"出場張數 ({fill.quantity}) 超過剩餘持倉 ({remaining})"
        )

    exits = list(trade.exits or [])
    now_iso = datetime.now().isoformat()

    if fill.type in ("tp", "sl"):
        # 找到對應計畫並標記成交
        matched = False
        for e in exits:
            if e.get("type") == fill.type and e.get("seq") == fill.seq and not e.get("filled_time"):
                e["filled_time"] = now_iso
                e["filled_price"] = fill.filled_price
                e["quantity"] = fill.quantity  # 以實際成交張數為準
                matched = True
                break
        if not matched:
            # 計畫不存在則追加一筆已成交記錄
            exits.append({
                "type": fill.type, "seq": fill.seq, "price": fill.filled_price,
                "quantity": fill.quantity, "filled_time": now_iso, "filled_price": fill.filled_price,
            })
    else:  # manual
        exits.append({
            "type": "manual", "seq": 0, "price": fill.filled_price,
            "quantity": fill.quantity, "filled_time": now_iso, "filled_price": fill.filled_price,
        })

    # 更新損益與狀態
    pnl = (fill.filled_price - float(trade.entry_price)) * fill.quantity * SHARES_PER_LOT
    trade.realized_pnl = float(trade.realized_pnl) + pnl
    trade.remaining_quantity = remaining - fill.quantity
    trade.exits = exits
    flag_modified(trade, "exits")

    if int(trade.remaining_quantity) == 0:
        trade.status = "closed"
        trade.closed_at = datetime.now()
    else:
        trade.status = "partial"

    await db.commit()
    await db.refresh(trade)

    latest = await _latest_close(db, trade.stock_code)
    return _serialize(trade, latest)


@router.delete("/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paper_trade(
    trade_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """刪除模擬單"""
    result = await db.execute(
        select(PaperTrade).where(
            PaperTrade.id == trade_id,
            PaperTrade.user_id == current_user.id,
        )
    )
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="找不到該模擬單")

    await db.delete(trade)
    await db.commit()
