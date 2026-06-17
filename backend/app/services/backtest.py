"""
技術面策略回測引擎（point-in-time）

把多因子策略「機械可重現的技術核心」用歷史 daily_bars 逐日重放：
- 進場訊號：ATR% 在區間、RSI 在區間、突破 N 日高、MA20 > MA60（多頭）
- 出場：ATR 停損（close − k×ATR）或目標價（近 N 日高與 +target% 取大）觸及即出
- 部位：沿用 P0 的 risk.position_size（每筆風險% + 單一持股上限 + 可用現金）
- 成本：沿用 P0 的 trading_costs（手續費 + 證交稅）

**範圍說明**：基本面與情緒面因子缺乏歷史資料，無法 point-in-time 重算，故回測僅涵蓋
技術面（含量價/突破）。這是誠實的近似 —— 反映策略的技術核心，不等同線上完整評分。

為效能，每檔股票的 K 線只載入一次，指標以純 Python 向量化計算後逐日迭代。
金額 = 元，數量 = 張（1 張 = 1000 股）。
"""
import math
import statistics
from datetime import date

from sqlalchemy import select

from app.models.daily_bar import DailyBar
from app.services import trading_costs, risk

SHARES_PER_LOT = 1000

# 預設標的池（大型權值股，dev/正式 DB 通常有完整歷史）
DEFAULT_UNIVERSE = [
    "2330", "2317", "2454", "2308", "2303", "2412", "2882", "2881", "2891", "3008",
    "2002", "1301", "1303", "2207", "2603", "3711", "2379", "2357", "2382", "3034",
]


def _sma(values, n):
    out = [None] * len(values)
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= n:
            s -= values[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def _rsi(values, n=14):
    out = [None] * len(values)
    if len(values) <= n:
        return out
    gains = losses = 0.0
    for i in range(1, n + 1):
        ch = values[i] - values[i - 1]
        gains += max(ch, 0.0)
        losses += max(-ch, 0.0)
    avg_g, avg_l = gains / n, losses / n
    out[n] = 100 - 100 / (1 + (avg_g / avg_l if avg_l else 999))
    for i in range(n + 1, len(values)):
        ch = values[i] - values[i - 1]
        avg_g = (avg_g * (n - 1) + max(ch, 0.0)) / n
        avg_l = (avg_l * (n - 1) + max(-ch, 0.0)) / n
        rs = avg_g / avg_l if avg_l else 999
        out[i] = 100 - 100 / (1 + rs)
    return out


def _atr(high, low, close, n=14):
    out = [None] * len(close)
    trs = [0.0] * len(close)
    for i in range(len(close)):
        if i == 0:
            trs[i] = high[i] - low[i]
        else:
            trs[i] = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))
    if len(close) <= n:
        return out
    atr = sum(trs[1:n + 1]) / n
    out[n] = atr
    for i in range(n + 1, len(close)):
        atr = (atr * (n - 1) + trs[i]) / n
        out[i] = atr
    return out


def _downsample(curve, target=200):
    if len(curve) <= target:
        return curve
    step = math.ceil(len(curve) / target)
    sampled = curve[::step]
    if sampled[-1] is not curve[-1]:
        sampled.append(curve[-1])
    return sampled


def _compute_metrics(initial, equity_curve, closed):
    final_equity = equity_curve[-1]["equity"] if equity_curve else initial
    total_return = (final_equity - initial) / initial * 100 if initial else 0

    cagr = None
    if len(equity_curve) >= 2 and initial > 0 and final_equity > 0:
        days = (date.fromisoformat(equity_curve[-1]["date"]) - date.fromisoformat(equity_curve[0]["date"])).days
        if days > 0:
            cagr = ((final_equity / initial) ** (365 / days) - 1) * 100

    peak = -1.0
    mdd = 0.0
    for pt in equity_curve:
        peak = max(peak, pt["equity"])
        if peak > 0:
            mdd = min(mdd, (pt["equity"] - peak) / peak * 100)

    pnls = [t["pnl"] for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [-p for p in pnls if p < 0]
    win_rate = len(wins) / len(closed) * 100 if closed else 0
    profit_factor = round(sum(wins) / sum(losses), 2) if losses else None
    holds = [
        (date.fromisoformat(t["exit_date"]) - date.fromisoformat(t["entry_date"])).days
        for t in closed
    ]
    avg_hold = round(sum(holds) / len(holds), 1) if holds else None

    rets = []
    for i in range(1, len(equity_curve)):
        prev = equity_curve[i - 1]["equity"]
        if prev > 0:
            rets.append((equity_curve[i]["equity"] - prev) / prev)
    sharpe = None
    if len(rets) >= 2:
        sd = statistics.pstdev(rets)
        sharpe = round(statistics.mean(rets) / sd * math.sqrt(252), 2) if sd else None

    return {
        "total_return_pct": round(total_return, 2),
        "cagr_pct": round(cagr, 2) if cagr is not None else None,
        "max_drawdown_pct": round(mdd, 2),
        "win_rate": round(win_rate, 1),
        "profit_factor": profit_factor,
        "num_trades": len(closed),
        "avg_hold_days": avg_hold,
        "sharpe": sharpe,
        "final_equity": round(final_equity),
        "initial_capital": round(initial),
    }


async def _load_series(session, codes, end_d):
    series = {}
    for code in codes:
        rows = (await session.execute(
            select(
                DailyBar.trade_date, DailyBar.high_price, DailyBar.low_price,
                DailyBar.close_price, DailyBar.adjusted_close,
            )
            .where(DailyBar.stock_code == code, DailyBar.trade_date <= end_d)
            .order_by(DailyBar.trade_date)
        )).all()
        if len(rows) < 60:
            continue
        dates = [r[0] for r in rows]
        raw_close = [float(r[3] or 0) for r in rows]
        high = [float(r[1] or r[3] or 0) for r in rows]
        low = [float(r[2] or r[3] or 0) for r in rows]
        adj = [float(r[4] or r[3] or 0) for r in rows]
        series[code] = {
            "dates": dates, "adj": adj,
            "ma20": _sma(adj, 20), "ma60": _sma(adj, 60),
            "rsi": _rsi(adj, 14), "atr": _atr(high, low, raw_close, 14),
            "idx": {d: i for i, d in enumerate(dates)},
        }
    return series


async def run_backtest(session, params: dict) -> dict:
    """
    執行回測。params 見 routers/backtest.py 的 BacktestParams。
    回傳 {metrics, equity_curve, trades}（trades=平倉筆數）。
    """
    codes = (params.get("stock_codes") or DEFAULT_UNIVERSE)[:50]
    start_d = date.fromisoformat(params["start"])
    end_d = date.fromisoformat(params["end"])
    capital = float(params.get("initial_capital", 1_000_000))
    risk_pct = float(params.get("risk_per_trade_pct", 2))
    discount = float(params.get("fee_discount", 1.0))
    max_positions = int(params.get("max_positions", 5))
    max_position_pct = float(params.get("max_position_pct", 20))
    atr_min = float(params.get("atr_pct_min", 2.5))
    atr_max = float(params.get("atr_pct_max", 9))
    rsi_min = float(params.get("rsi_min", 35))
    rsi_max = float(params.get("rsi_max", 75))
    nbreak = int(params.get("breakout_lookback", 20))
    sl_mult = float(params.get("sl_atr_mult", 1.5))
    target_pct = float(params.get("target_pct", 5)) / 100

    series = await _load_series(session, codes, end_d)
    if not series:
        return {"error": "查無足夠歷史資料（標的需 ≥60 根 K 線）", "metrics": {}, "equity_curve": [], "trades": 0}

    cal = sorted({d for s in series.values() for d in s["dates"] if start_d <= d <= end_d})
    if not cal:
        return {"error": "區間內無交易日", "metrics": {}, "equity_curve": [], "trades": 0}

    def price_on(code, d):
        i = series[code]["idx"].get(d)
        return series[code]["adj"][i] if i is not None else None

    cash = capital
    positions = {}
    closed = []
    equity_curve = []

    for d in cal:
        # 1) 出場：觸及目標或停損即以當日收盤平倉
        for code in list(positions.keys()):
            px = price_on(code, d)
            if px is None:
                continue
            p = positions[code]
            hit_t, hit_s = px >= p["target"], px <= p["sl"]
            if hit_t or hit_s:
                cash += px * p["lots"] * SHARES_PER_LOT - trading_costs.sell_fee(px, p["lots"], discount)
                closed.append({
                    "code": code, "entry": p["entry"], "exit": round(px, 2), "lots": p["lots"],
                    "pnl": round(trading_costs.net_realized_pnl(p["entry"], px, p["lots"], discount)),
                    "entry_date": p["entry_date"].isoformat(), "exit_date": d.isoformat(),
                    "reason": "tp" if hit_t else "sl",
                })
                del positions[code]

        # 2) 進場：掃描標的，符合訊號則依風險定量開倉
        if len(positions) < max_positions:
            mtm = sum((price_on(c, d) or positions[c]["entry"]) * positions[c]["lots"] * SHARES_PER_LOT for c in positions)
            equity_now = cash + mtm
            cands = []
            for code, s in series.items():
                if code in positions:
                    continue
                i = s["idx"].get(d)
                if i is None or i < nbreak or s["ma60"][i] is None or s["rsi"][i] is None or s["atr"][i] is None:
                    continue
                close = s["adj"][i]
                atrv = s["atr"][i]
                atr_pct = atrv / close * 100 if close else 0
                if not (atr_min <= atr_pct <= atr_max) or not (rsi_min <= s["rsi"][i] <= rsi_max):
                    continue
                window = s["adj"][i - nbreak + 1:i + 1]
                bull = s["ma20"][i] and s["ma20"][i] > s["ma60"][i]
                if close >= max(window) and bull:
                    cands.append((atr_pct, code, close, atrv, i))
            cands.sort(key=lambda x: (-x[0], x[1]))  # 波動高者優先，code 為次序保證決定性
            for atr_pct, code, close, atrv, i in cands:
                if len(positions) >= max_positions:
                    break
                sl = round(close - sl_mult * atrv, 2)
                if sl <= 0 or sl >= close:
                    continue
                window = series[code]["adj"][max(0, i - nbreak + 1):i + 1]
                target = round(max(max(window), close * (1 + target_pct)), 2)
                lots = risk.position_size(equity_now, risk_pct, close, sl, max_position_pct, cash)
                if lots < 1:
                    continue
                cost = close * lots * SHARES_PER_LOT + trading_costs.buy_fee(close, lots, discount)
                if cost > cash:
                    continue
                cash -= cost
                positions[code] = {"entry": close, "lots": lots, "sl": sl, "target": target, "entry_date": d}

        # 3) 當日權益快照（現金 + 持倉市值）
        mtm = sum((price_on(c, d) or positions[c]["entry"]) * positions[c]["lots"] * SHARES_PER_LOT for c in positions)
        equity_curve.append({"date": d.isoformat(), "equity": round(cash + mtm)})

    # 區間結束：剩餘部位以最後收盤平倉
    last = cal[-1]
    for code in list(positions.keys()):
        p = positions[code]
        px = price_on(code, last) or p["entry"]
        cash += px * p["lots"] * SHARES_PER_LOT - trading_costs.sell_fee(px, p["lots"], discount)
        closed.append({
            "code": code, "entry": p["entry"], "exit": round(px, 2), "lots": p["lots"],
            "pnl": round(trading_costs.net_realized_pnl(p["entry"], px, p["lots"], discount)),
            "entry_date": p["entry_date"].isoformat(), "exit_date": last.isoformat(), "reason": "eod",
        })
    if equity_curve:
        equity_curve[-1]["equity"] = round(cash)

    return {
        "metrics": _compute_metrics(capital, equity_curve, closed),
        "equity_curve": _downsample(equity_curve, 200),
        "trades": len(closed),
    }
