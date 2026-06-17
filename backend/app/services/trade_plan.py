"""
交易劇本服務（技術面最上層：把所有層彙整成可執行劇本）

整合 多週期共振(T2) + 結構支撐壓力(T1) + 相對強弱(T3) + 背離(T4) + ADX/量價，
產出：方向、setup 類型、進場區、結構式停損、目標、風報比、信心、失效條件、建議張數，
並輸出 `paper_prefill`（形狀＝PaperTradeCreate）一鍵帶入模擬單。

`build_trade_plan` 為純函式（易測）；`TradePlanService` 負責蒐集各層輸入。
本服務僅供決策輔助，不碰券商實單。
"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_VERDICT_LABEL = {
    "aligned_bull": "多頭共振", "aligned_bear": "空頭共振",
    "pullback_in_uptrend": "多頭回檔", "bounce_in_downtrend": "空頭反彈",
    "conflict": "多空衝突", "mixed": "方向不明",
}

_DEFAULT_ACCOUNT = {"equity": 1_000_000, "available_cash": 1_000_000, "risk_pct": 2, "max_position_pct": 20}


def _nearest_support(zones, price):
    cands = [z for z in zones if z.get("center", 0) < price]
    return max(cands, key=lambda z: z["center"]) if cands else None


def _nearest_resistance(zones, price):
    cands = [z for z in zones if z.get("center", 0) > price]
    return min(cands, key=lambda z: z["center"]) if cands else None


def build_trade_plan(*, current_price, atr_14, zones, mtf, rs, divergences,
                     adx=None, volume_ratio=1.0, account=None, range_box=None) -> dict:
    """純函式：彙整各層 → 交易劇本。多單為主（模擬單做多）；空/觀望不產生 prefill。"""
    price = current_price or 0
    atr = atr_14 or (price * 0.02) or 1.0
    zones = zones or []
    divs = divergences or []
    verdict = (mtf or {}).get("verdict", "mixed")
    align = (mtf or {}).get("alignment_score", 0)
    rs_rating = ((rs or {}).get("rs_rating") or {}).get("value")

    if verdict in ("aligned_bull", "pullback_in_uptrend"):
        direction = "long"
    elif verdict in ("aligned_bear", "bounce_in_downtrend"):
        direction = "short"
    else:
        direction = "stand_aside"

    base = {"direction": direction, "verdict": verdict, "verdict_label": _VERDICT_LABEL.get(verdict, verdict),
            "current_price": round(price, 2)}

    if direction != "long":
        reason = {
            "short": "多週期偏空，不宜做多；模擬單以做多為主，建議避開或等待止跌。",
            "stand_aside": "多週期方向分歧／衝突，建議觀望，等待訊號明朗再進場。",
        }.get(direction, "")
        return {**base, "setup_type": "觀望", "confidence": {"score": 0, "level": "low"},
                "rr": None, "narrative": reason, "paper_prefill": None}

    sup = _nearest_support(zones, price)
    res = _nearest_resistance(zones, price)

    # setup + 進場區
    if verdict == "pullback_in_uptrend" and sup and sup["center"] >= price * 0.9:
        setup = "順勢拉回"
        entry_low, entry_high = sup["low"], min(sup["high"], price)
    elif res and res["center"] <= price * 1.04 and volume_ratio >= 1.1:
        setup = "突破"
        entry_low, entry_high = res["high"], res["high"] + 0.3 * atr
    elif range_box:
        setup = "區間"
        entry_low, entry_high = range_box["bottom"], range_box["bottom"] * 1.01
    else:
        setup = "順勢續抱"
        entry_low, entry_high = price - 0.3 * atr, price
    entry_mid = round((entry_low + entry_high) / 2, 2)

    # 結構式停損：較緊（較近、損失較小 → 多單取 max）
    struct_stop = (sup["low"] * 0.995) if (sup and sup["low"] < entry_mid) else (entry_mid - 2 * atr)
    atr_stop = entry_mid - 1.8 * atr
    stop = max(struct_stop, atr_stop)
    stop_basis = "structure" if struct_stop >= atr_stop else "atr"
    if stop >= entry_mid:  # 防呆
        stop = entry_mid - 1.8 * atr
        stop_basis = "atr"
    stop = round(stop, 2)

    risk = entry_mid - stop
    target1 = res["center"] if (res and res["center"] > entry_mid) else (entry_mid + 2 * risk)
    target2 = entry_mid + 3 * risk
    if range_box:
        target2 = max(target2, range_box["top"] + (range_box["top"] - range_box["bottom"]))
    target1 = round(target1, 2)
    target2 = round(max(target2, target1 + risk), 2)
    rr = round((target1 - entry_mid) / risk, 2) if risk > 0 else None

    # 信心
    conf = 0.6 * align
    if rs_rating is not None:
        conf += (rs_rating - 50) / 50 * 20
    if volume_ratio >= 1.2:
        conf += 8
    if any(d.get("kind") == "bullish" for d in divs):
        conf += 10
    if any(d.get("kind") == "bearish" for d in divs):
        conf -= 15
    conf = max(0, min(100, round(conf)))
    level = "high" if conf >= 70 else ("medium" if conf >= 45 else "low")

    acct = account or _DEFAULT_ACCOUNT
    from app.services.risk import position_size
    lots = position_size(acct.get("equity", 0), acct.get("risk_pct", 2), entry_mid, stop,
                         acct.get("max_position_pct", 20), acct.get("available_cash", 0))

    # prefill 用 max(1, lots)：suggested_lots=0（超風險預算）時仍讓「開模擬單」可用，使用者可再調整
    prefill = None
    if rr:
        qty = max(1, lots)
        exits = [{"type": "sl", "seq": 1, "price": stop, "quantity": qty}]
        if qty >= 2:
            tp1q = qty // 2
            exits.append({"type": "tp", "seq": 1, "price": target1, "quantity": tp1q})
            exits.append({"type": "tp", "seq": 2, "price": target2, "quantity": qty - tp1q})
        else:
            exits.append({"type": "tp", "seq": 1, "price": target1, "quantity": 1})
        prefill = {"stock_code": None, "entry_price": entry_mid, "quantity": qty, "exits": exits}

    narrative = (f"{_VERDICT_LABEL.get(verdict, verdict)}・{setup}：於 {entry_low:.0f}–{entry_high:.0f} 進場，"
                 f"停損 {stop:.0f}（{'結構' if stop_basis == 'structure' else 'ATR'}），目標 {target1:.0f}／{target2:.0f}"
                 f"，風報比 {rr}。")
    return {
        **base, "setup_type": setup,
        "entry_zone": [round(entry_low, 2), round(entry_high, 2)], "entry_mid": entry_mid,
        "stop": stop, "stop_basis": stop_basis, "stop_pct": round((stop - entry_mid) / entry_mid * 100, 2) if entry_mid else None,
        "target1": target1, "target2": target2, "rr": rr,
        "confidence": {"score": conf, "level": level},
        "rs_rating": rs_rating,
        "invalidation": {"price": stop, "note": f"收盤跌破 {stop:.0f}（停損/支撐下緣）即視為劇本失效"},
        "suggested_lots": lots,
        "narrative": narrative,
        "paper_prefill": prefill,
    }


class TradePlanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze(self, stock_code: str, account: dict | None = None) -> dict:
        from app.services.technical import TechnicalService
        from app.services.structure import StructureService
        from app.services.relative_strength import RelativeStrengthService

        tech = TechnicalService(self.db)
        ta = await tech.analyze(stock_code, "medium", "1d")
        if not ta.get("has_data"):
            return {"stock_code": stock_code, "has_data": False}

        st = await StructureService(self.db).analyze(stock_code, "1d")
        mtf = await tech.multi_timeframe(stock_code)
        try:
            rs = await RelativeStrengthService(self.db).analyze(stock_code)
        except Exception:
            rs = {}

        plan = build_trade_plan(
            current_price=st.get("current_price") or 0,
            atr_14=st.get("atr_14") or 0,
            zones=st.get("zones", []),
            mtf=mtf,
            rs=rs,
            divergences=st.get("divergences", []),
            adx=ta.get("adx"),
            volume_ratio=(ta.get("volume", {}) or {}).get("ratio", 1.0),
            account=account or _DEFAULT_ACCOUNT,
            range_box=st.get("range_box"),
        )
        if plan.get("paper_prefill"):
            plan["paper_prefill"]["stock_code"] = stock_code
        return {"stock_code": stock_code, "has_data": True, **plan}
