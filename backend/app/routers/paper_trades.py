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
from app.models.paper_account import PaperAccount, DEFAULT_INITIAL_CAPITAL
from app.models.paper_equity_snapshot import PaperEquitySnapshot
from app.models.daily_bar import DailyBar
from app.utils.security import get_current_user
from app.services.trading_costs import net_realized_pnl, round_trip_fee

router = APIRouter(prefix="/api/paper-trades", tags=["模擬交易"])

SHARES_PER_LOT = 1000  # 1 張 = 1000 股
ACTIVE_STATUSES = ("open", "partial")  # 佔用現金/曝險、計入績效的狀態（排除 proposed/closed）


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


class AccountUpdate(BaseModel):
    initial_capital: float = Field(..., gt=0, description="本金（元）")


class SettingsUpdate(BaseModel):
    """模擬帳戶費率 + 風控設定（部分更新，未提供的欄位不變）"""
    auto_trade_mode: Optional[str] = Field(None, pattern="^(off|semi|auto)$")
    fee_discount: Optional[float] = Field(None, gt=0, le=1, description="券商手續費折數")
    risk_per_trade_pct: Optional[float] = Field(None, gt=0, le=100)
    max_position_pct: Optional[float] = Field(None, gt=0, le=100)
    max_total_exposure_pct: Optional[float] = Field(None, gt=0, le=200)
    daily_loss_limit_pct: Optional[float] = Field(None, gt=0, le=100)
    max_consecutive_losses: Optional[int] = Field(None, ge=1, le=50)
    max_positions: Optional[int] = Field(None, ge=1, le=50)


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


async def _get_or_create_account(db: AsyncSession, user_id) -> PaperAccount:
    """取得使用者模擬帳戶，不存在則以預設本金建立"""
    result = await db.execute(
        select(PaperAccount).where(PaperAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        account = PaperAccount(user_id=user_id, initial_capital=DEFAULT_INITIAL_CAPITAL)
        db.add(account)
        await db.commit()
        await db.refresh(account)
    return account


async def _cash_summary(db: AsyncSession, user_id, initial_capital: float) -> dict:
    """
    計算現金面摘要（不需現價）：

    - deployed：未平倉部位佔用的成本（進場價 × 剩餘張數）
    - realized：所有模擬單已實現損益加總
    - available：可用餘額 = 本金 + 已實現損益 − 已投入成本

    開倉時以 available 作為硬上限。
    """
    result = await db.execute(select(PaperTrade).where(PaperTrade.user_id == user_id))
    trades = result.scalars().all()
    realized = sum(float(t.realized_pnl) for t in trades)
    deployed = sum(
        float(t.entry_price) * int(t.remaining_quantity) * SHARES_PER_LOT
        for t in trades if t.status in ACTIVE_STATUSES
    )
    return {
        "realized": realized,
        "deployed": deployed,
        "available": initial_capital + realized - deployed,
    }


def _serialize(trade: PaperTrade, latest_price: Optional[float], discount: float = 1.0) -> dict:
    """組合回應，計算未實現/總損益（已扣手續費 + 證交稅）"""
    entry_price = float(trade.entry_price)
    remaining = int(trade.remaining_quantity)
    realized = float(trade.realized_pnl)

    unrealized = None
    unrealized_pct = None
    if latest_price and remaining > 0:
        gross = (latest_price - entry_price) * remaining * SHARES_PER_LOT
        unrealized = round(gross - round_trip_fee(entry_price, latest_price, remaining, discount), 0)
        remaining_cost = entry_price * remaining * SHARES_PER_LOT
        unrealized_pct = round(unrealized / remaining_cost * 100, 2) if remaining_cost else None

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
        "decision_snapshot": trade.decision_snapshot,
        "closed_at": trade.closed_at.isoformat() if trade.closed_at else None,
    }


def _account_settings(account) -> dict:
    """帳戶費率/風控設定（供設定頁讀取）"""
    return {
        "auto_trade_mode": account.auto_trade_mode,
        "fee_discount": float(account.fee_discount),
        "risk_per_trade_pct": float(account.risk_per_trade_pct),
        "max_position_pct": float(account.max_position_pct),
        "max_total_exposure_pct": float(account.max_total_exposure_pct),
        "daily_loss_limit_pct": float(account.daily_loss_limit_pct),
        "max_consecutive_losses": int(account.max_consecutive_losses),
        "max_positions": int(account.max_positions),
        "initial_capital": float(account.initial_capital),
    }


def _enforce_risk_caps(account, cash: dict, initial_capital: float, cost: float):
    """開倉 / 確認共用的硬性風控：可用餘額、單一持股上限、總曝險上限。"""
    if cost > cash["available"]:
        raise HTTPException(
            status_code=400,
            detail=f"進場成本 ${cost:,.0f} 超過可用餘額 ${cash['available']:,.0f}"
                   f"（本金 ${initial_capital:,.0f}，已投入 ${cash['deployed']:,.0f}）。"
                   f"請降低張數或調高本金。",
        )
    equity = initial_capital + cash["realized"]
    pos_cap = equity * float(account.max_position_pct) / 100
    if cost > pos_cap:
        raise HTTPException(
            status_code=400,
            detail=f"單筆部位成本 ${cost:,.0f} 超過單一持股上限 {float(account.max_position_pct):.0f}%"
                   f"（${pos_cap:,.0f}）。請降低張數，或於設定調整上限。",
        )
    exposure_cap = equity * float(account.max_total_exposure_pct) / 100
    if cash["deployed"] + cost > exposure_cap:
        raise HTTPException(
            status_code=400,
            detail=f"加上本筆後總曝險 ${cash['deployed'] + cost:,.0f} 超過總曝險上限 "
                   f"{float(account.max_total_exposure_pct):.0f}%（${exposure_cap:,.0f}）。",
        )


def _performance_metrics(closed: list) -> dict:
    """進階績效：profit factor、最大連敗、平均持有天數、最大單筆盈虧、每筆報酬夏普近似。"""
    if not closed:
        return {
            "profit_factor": None, "max_consecutive_losses": 0, "avg_hold_days": None,
            "largest_win": 0, "largest_loss": 0, "sharpe": None,
        }
    import statistics
    pnls = [float(t.realized_pnl) for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [-p for p in pnls if p < 0]
    profit_factor = round(sum(wins) / sum(losses), 2) if losses else None

    by_time = sorted(closed, key=lambda t: t.closed_at or t.entry_time)
    streak = max_streak = 0
    for t in by_time:
        if float(t.realized_pnl) < 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    holds = [
        (t.closed_at - t.entry_time).total_seconds() / 86400
        for t in closed if t.closed_at and t.entry_time
    ]
    avg_hold_days = round(sum(holds) / len(holds), 1) if holds else None

    rets = [
        float(t.realized_pnl) / (float(t.entry_price) * int(t.quantity) * SHARES_PER_LOT)
        for t in closed if t.entry_price and t.quantity
    ]
    sharpe = None
    if len(rets) >= 2:
        sd = statistics.pstdev(rets)
        sharpe = round(statistics.mean(rets) / sd, 2) if sd else None

    return {
        "profit_factor": profit_factor,
        "max_consecutive_losses": max_streak,
        "avg_hold_days": avg_hold_days,
        "largest_win": round(max(wins), 0) if wins else 0,
        "largest_loss": round(max(losses), 0) if losses else 0,
        "sharpe": sharpe,
    }


def _daily_risk_metrics(equity_series: list) -> dict:
    """由日權益序列計算年化夏普 / Sortino / 歷史最大回撤（需 ≥3 個快照）。"""
    if len(equity_series) < 3:
        return {"sharpe": None, "sortino": None, "max_drawdown_pct": None}
    import statistics, math
    eq = [p["equity"] for p in equity_series]
    rets = [(eq[i] - eq[i - 1]) / eq[i - 1] for i in range(1, len(eq)) if eq[i - 1] > 0]
    if len(rets) < 2:
        return {"sharpe": None, "sortino": None, "max_drawdown_pct": None}
    mean = statistics.mean(rets)
    sd = statistics.pstdev(rets)
    downside = [r for r in rets if r < 0]
    dsd = statistics.pstdev(downside) if len(downside) >= 2 else (abs(downside[0]) if downside else 0)
    peak = -1.0
    mdd = 0.0
    for e in eq:
        peak = max(peak, e)
        if peak > 0:
            mdd = min(mdd, (e - peak) / peak * 100)
    return {
        "sharpe": round(mean / sd * math.sqrt(252), 2) if sd else None,
        "sortino": round(mean / dsd * math.sqrt(252), 2) if dsd else None,
        "max_drawdown_pct": round(mdd, 2),
    }


def _downsample(series: list, target: int = 120) -> list:
    if len(series) <= target:
        return series
    import math
    step = math.ceil(len(series) / target)
    out = series[::step]
    if out[-1] is not series[-1]:
        out.append(series[-1])
    return out


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

    # proposed（半自動待確認）不計入績效與部位
    real_trades = [t for t in trades if t.status != "proposed"]
    active = [t for t in trades if t.status in ACTIVE_STATUSES]
    proposed_count = len(trades) - len(real_trades)

    closed = [t for t in real_trades if t.status == "closed"]
    wins = [float(t.realized_pnl) for t in closed if float(t.realized_pnl) > 0]
    losses = [abs(float(t.realized_pnl)) for t in closed if float(t.realized_pnl) < 0]

    win_rate = len(wins) / len(closed) if closed else 0
    avg_win = sum(wins) / len(wins) if wins else 0
    avg_loss = sum(losses) / len(losses) if losses else 0
    rr_ratio = round(avg_win / avg_loss, 2) if avg_loss else None
    ev = round(win_rate * avg_win - (1 - win_rate) * avg_loss, 0) if closed else 0

    # 帳戶面（含費率折數）
    account = await _get_or_create_account(db, current_user.id)
    initial_capital = float(account.initial_capital)
    discount = float(account.fee_discount)

    total_cost = sum(float(t.entry_price) * int(t.quantity) * SHARES_PER_LOT for t in real_trades)
    realized_total = sum(float(t.realized_pnl) for t in real_trades)

    # 未實現損益（扣完整來回成本）+ 已投入成本（僅 open/partial）
    unrealized_total = 0.0
    deployed = 0.0
    for t in active:
        remaining = int(t.remaining_quantity)
        if remaining > 0:
            deployed += float(t.entry_price) * remaining * SHARES_PER_LOT
            latest = await _latest_close(db, t.stock_code)
            if latest:
                gross = (latest - float(t.entry_price)) * remaining * SHARES_PER_LOT
                unrealized_total += gross - round_trip_fee(float(t.entry_price), latest, remaining, discount)

    available_cash = initial_capital + realized_total - deployed
    equity = initial_capital + realized_total + unrealized_total  # 總權益（現金 + 持倉市值）
    return_pct = round((equity - initial_capital) / initial_capital * 100, 2) if initial_capital else 0

    # 滾動更新權益高點，計算當前回撤
    prev_peak = float(account.peak_equity) if account.peak_equity else initial_capital
    peak = max(prev_peak, equity)
    if peak != prev_peak:
        account.peak_equity = peak
        await db.commit()
    drawdown_pct = round((equity - peak) / peak * 100, 2) if peak else 0  # ≤ 0

    # 日權益快照 → 真夏普 / Sortino / 歷史最大回撤 + 權益走勢
    snaps = (await db.execute(
        select(PaperEquitySnapshot)
        .where(PaperEquitySnapshot.user_id == current_user.id)
        .order_by(PaperEquitySnapshot.snapshot_date)
    )).scalars().all()
    equity_series = [{"date": s.snapshot_date.isoformat(), "equity": float(s.equity)} for s in snaps]
    daily = _daily_risk_metrics(equity_series)
    perf = _performance_metrics(closed)

    return {
        "total_trades": len(real_trades),
        "open_trades": len(active),
        "closed_trades": len(closed),
        "proposed_trades": proposed_count,
        "win_rate": round(win_rate * 100, 2),
        "avg_win": round(avg_win, 0),
        "avg_loss": round(avg_loss, 0),
        "rr_ratio": rr_ratio,
        "ev": ev,
        "total_cost": round(total_cost, 0),
        "realized_pnl": round(realized_total, 0),
        "unrealized_pnl": round(unrealized_total, 0),
        "total_pnl": round(realized_total + unrealized_total, 0),
        # 帳戶本金面
        "initial_capital": round(initial_capital, 0),
        "available_cash": round(available_cash, 0),
        "deployed": round(deployed, 0),
        "equity": round(equity, 0),
        "return_pct": return_pct,
        "peak_equity": round(peak, 0),
        "drawdown_pct": drawdown_pct,
        **perf,
        "sharpe": daily["sharpe"] if daily["sharpe"] is not None else perf["sharpe"],
        "sortino": daily["sortino"],
        "max_drawdown_pct": daily["max_drawdown_pct"],
        "equity_curve": _downsample(equity_series, 120),
    }


@router.get("/account")
async def get_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """取得模擬帳戶本金設定與可用餘額摘要"""
    account = await _get_or_create_account(db, current_user.id)
    initial_capital = float(account.initial_capital)
    cash = await _cash_summary(db, current_user.id, initial_capital)
    return {
        "initial_capital": initial_capital,
        "available_cash": round(cash["available"], 0),
        "deployed": round(cash["deployed"], 0),
        "realized_pnl": round(cash["realized"], 0),
        "peak_equity": float(account.peak_equity) if account.peak_equity else None,
    }


@router.put("/account")
async def update_account(
    data: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """設定模擬帳戶本金。新本金不可低於已投入的未平倉成本。"""
    account = await _get_or_create_account(db, current_user.id)
    cash = await _cash_summary(db, current_user.id, data.initial_capital)
    if data.initial_capital < cash["deployed"]:
        raise HTTPException(
            status_code=400,
            detail=f"本金 ${data.initial_capital:,.0f} 低於目前已投入成本 ${cash['deployed']:,.0f}，"
                   f"請先平倉或設定更高本金",
        )
    account.initial_capital = data.initial_capital
    # 本金變動後重設權益高點基準
    account.peak_equity = None
    await db.commit()
    await db.refresh(account)
    return {
        "initial_capital": float(account.initial_capital),
        "available_cash": round(cash["available"], 0),
        "deployed": round(cash["deployed"], 0),
    }


@router.get("/settings")
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """取得自動交易模式 + 費率 + 風控設定"""
    account = await _get_or_create_account(db, current_user.id)
    return _account_settings(account)


@router.put("/settings")
async def update_settings(
    data: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新自動交易模式 + 費率 + 風控設定（部分更新，未提供欄位不變）"""
    account = await _get_or_create_account(db, current_user.id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(account, field, value)
    await db.commit()
    await db.refresh(account)
    return _account_settings(account)


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
    result = await auto_pick_and_open(current_user.id, respect_mode=False)
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

    account = await _get_or_create_account(db, current_user.id)
    discount = float(account.fee_discount)

    items = []
    price_cache: dict = {}
    for t in trades:
        if t.stock_code not in price_cache:
            price_cache[t.stock_code] = await _latest_close(db, t.stock_code)
        items.append(_serialize(t, price_cache[t.stock_code], discount))

    return {"trades": items, "total": len(items)}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_paper_trade(
    data: PaperTradeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """建立模擬單（進場 + TP/SL 出場計畫）"""
    # 強制停損：模擬交易必須設定至少一筆 SL，以建立風險紀律
    if not any(e.type == "sl" for e in data.exits):
        raise HTTPException(
            status_code=400,
            detail="請至少設定一筆停損（SL）— 模擬交易強制停損，幫助你建立「進場前先想好退場」的紀律",
        )

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

    # 餘額 + 風控硬上限（可用餘額 / 單一持股 / 總曝險）
    account = await _get_or_create_account(db, current_user.id)
    initial_capital = float(account.initial_capital)
    cash = await _cash_summary(db, current_user.id, initial_capital)
    cost = data.entry_price * data.quantity * SHARES_PER_LOT
    _enforce_risk_caps(account, cash, initial_capital, cost)

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
    return _serialize(trade, latest, float(account.fee_discount))


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

    # 更新損益與狀態（已扣手續費 + 證交稅）
    account = await _get_or_create_account(db, current_user.id)
    discount = float(account.fee_discount)
    pnl = net_realized_pnl(float(trade.entry_price), fill.filled_price, fill.quantity, discount)
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
    return _serialize(trade, latest, discount)


@router.post("/{trade_id}/confirm")
async def confirm_proposed(
    trade_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """確認 AI 建議單（半自動 proposed → open），確認時重新檢查餘額與風控上限。"""
    result = await db.execute(
        select(PaperTrade).where(
            PaperTrade.id == trade_id,
            PaperTrade.user_id == current_user.id,
        )
    )
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="找不到該模擬單")
    if trade.status != "proposed":
        raise HTTPException(status_code=400, detail="只有 AI 建議單（proposed）可確認")

    account = await _get_or_create_account(db, current_user.id)
    initial_capital = float(account.initial_capital)
    cash = await _cash_summary(db, current_user.id, initial_capital)
    cost = float(trade.entry_price) * int(trade.remaining_quantity) * SHARES_PER_LOT
    _enforce_risk_caps(account, cash, initial_capital, cost)

    trade.status = "open"
    await db.commit()
    await db.refresh(trade)
    latest = await _latest_close(db, trade.stock_code)
    return _serialize(trade, latest, float(account.fee_discount))


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
