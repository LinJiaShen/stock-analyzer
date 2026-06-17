"""
模擬交易風控

供手動下單與 AI 自動開倉共用的風控計算（多為純函式，易測）：
- position_size：依「每筆風險 % + 單一持股上限 + 可用現金」決定張數（取代固定 1 張）
- todays_realized_pnl：當日已實現淨損益（每日虧損熔斷用）
- consecutive_losses：目前連續虧損次數（連敗暫停用）
- evaluate_auto_gates：AI 自動開倉前的綜合風控閘門

金額 = 元，數量 = 張（1 張 = 1000 股）。
"""
import math
from datetime import date
from typing import Iterable

from app.services.trading_costs import net_realized_pnl, SHARES_PER_LOT


def position_size(
    equity: float,
    risk_pct: float,
    entry: float,
    stop_loss: float,
    max_position_pct: float,
    available_cash: float,
) -> int:
    """
    依風險定量計算建議張數，取三個上限的最小值，無法買滿 1 張回 0：
    - 風險上限：本金 × 風險% ÷ 每張風險金額（(進場−停損) × 1000）
    - 單一持股上限：權益 × 上限% ÷ 每張成本
    - 可用現金上限：可用現金 ÷ 每張成本
    """
    if entry <= 0 or stop_loss <= 0 or entry <= stop_loss:
        return 0
    if equity <= 0 or available_cash <= 0:
        return 0

    per_lot_value = entry * SHARES_PER_LOT
    per_lot_risk = (entry - stop_loss) * SHARES_PER_LOT
    if per_lot_value <= 0 or per_lot_risk <= 0:
        return 0

    lots_by_risk = math.floor((equity * risk_pct / 100) / per_lot_risk)
    lots_by_position = math.floor((equity * max_position_pct / 100) / per_lot_value)
    lots_by_cash = math.floor(available_cash / per_lot_value)

    lots = min(lots_by_risk, lots_by_position, lots_by_cash)
    return int(lots) if lots >= 1 else 0


def _exit_date(filled_time) -> str:
    return str(filled_time)[:10] if filled_time else ""


def todays_realized_pnl(trades: Iterable, today: date, discount: float = 1.0) -> float:
    """加總「今天」成交的出場的淨損益（含部分平倉），供每日虧損熔斷判斷。"""
    total = 0.0
    key = today.isoformat()
    for t in trades:
        entry = float(t.entry_price)
        for e in (t.exits or []):
            if _exit_date(e.get("filled_time")) != key:
                continue
            qty = int(e.get("quantity") or 0)
            price = float(e.get("filled_price") or e.get("price") or 0)
            if qty > 0 and price > 0:
                total += net_realized_pnl(entry, price, qty, discount)
    return total


def consecutive_losses(closed_trades_desc: Iterable) -> int:
    """目前連續虧損次數：由最近一筆平倉往回數，遇到不虧損即停。"""
    count = 0
    for t in closed_trades_desc:
        if float(t.realized_pnl) < 0:
            count += 1
        else:
            break
    return count


def evaluate_auto_gates(account, trades, today: date, *, discount: float = None) -> dict:
    """
    AI 自動開倉前的風控閘門。任一條件不通過即 allowed=False，並附原因：
    - 持倉數達 max_positions
    - 當日已實現虧損達 daily_loss_limit_pct（以本金為基準）
    - 連續虧損達 max_consecutive_losses
    """
    if discount is None:
        discount = float(getattr(account, "fee_discount", 1.0) or 1.0)
    initial_capital = float(account.initial_capital)

    open_trades = [t for t in trades if t.status in ("open", "partial")]
    closed_desc = sorted(
        [t for t in trades if t.status == "closed" and t.closed_at],
        key=lambda t: t.closed_at,
        reverse=True,
    )

    reasons = []

    max_positions = int(account.max_positions)
    if len(open_trades) >= max_positions:
        reasons.append(f"持倉已滿（{len(open_trades)}/{max_positions}）")

    daily = todays_realized_pnl(trades, today, discount)
    daily_limit = initial_capital * float(account.daily_loss_limit_pct) / 100
    if daily <= -daily_limit:
        reasons.append(f"今日已實現虧損 {daily:,.0f} 觸及熔斷上限 -{daily_limit:,.0f}")

    consec = consecutive_losses(closed_desc)
    max_consec = int(account.max_consecutive_losses)
    if consec >= max_consec:
        reasons.append(f"連續虧損 {consec} 次達上限 {max_consec}，暫停當日開倉")

    return {
        "allowed": len(reasons) == 0,
        "reasons": reasons,
        "open_count": len(open_trades),
        "daily_pnl": round(daily, 0),
        "consecutive_losses": consec,
    }
