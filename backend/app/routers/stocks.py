"""
股票數據路由
"""
from typing import List, Optional
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.models.stock import Stock, IndustryChain
from app.models.daily_bar import DailyBar, ChipData, TDCCHolderData
from app.schemas.stock import StockResponse, IndustryChainResponse, StockWithIndustryResponse
from worker.yahoo_worker import yahoo_worker

router = APIRouter(prefix="/api/stocks", tags=["股票數據"])


class KLinePoint(BaseModel):
    date: date
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    adj_close: Optional[float] = None
    volume: Optional[int] = None
    amount: Optional[float] = None


class KLineResponse(BaseModel):
    stock_code: str
    interval: str
    adjusted: bool
    data: List[KLinePoint]


class ChipDataPoint(BaseModel):
    date: date
    foreign_net: Optional[float] = None
    trust_net: Optional[float] = None
    proprietary_net: Optional[float] = None
    margin_balance: Optional[float] = None
    margin_net: Optional[float] = None


class ChipResponse(BaseModel):
    stock_code: str
    days: int
    data: List[ChipDataPoint]


class PreMarketIndex(BaseModel):
    name: str
    symbol: str
    price: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    market_state: Optional[str] = None


class PreMarketResponse(BaseModel):
    international_indices: List[PreMarketIndex] = []
    adr_performance: List[dict] = []
    watchlist: List[dict] = []


@router.get("/", response_model=List[StockResponse])
async def get_stocks(
    q: Optional[str] = Query(None, description="搜尋股票代碼或名稱"),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """
    取得股票列表
    
    - **q**: 搜尋關鍵字 (代碼或名稱)
    - **skip**: 跳過筆數
    - **limit**: 回傳筆數
    """
    query = select(Stock)
    
    if q:
        query = query.where(
            (Stock.code.ilike(f"%{q}%")) | (Stock.name.ilike(f"%{q}%"))
        )
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    stocks = result.scalars().all()
    return stocks


@router.get("/pre-market", response_model=PreMarketResponse)
async def get_premarket_data():
    """
    取得盤前數據

    包含隔夜國際股市、ADR 表現、當日關注清單
    數據來源: Yahoo Finance (S&P 500, NASDAQ, TAIEX)
    """
    indices_data = await yahoo_worker.fetch_index_data()

    international_indices: List[PreMarketIndex] = []
    for name, data in indices_data.items():
        international_indices.append(PreMarketIndex(
            name=data.get("name", name),
            symbol=data.get("symbol", ""),
            price=data.get("price"),
            change=data.get("change"),
            change_percent=data.get("change_percent"),
            market_state=data.get("market_state"),
        ))

    # ADR 表現 (台灣主要 ADR 股票)
    adr_data = await yahoo_worker.fetch_adr_data()
    adr_performance: List[dict] = []
    if adr_data:
        for symbol, info in adr_data.items():
            adr_performance.append(info)

    return PreMarketResponse(
        international_indices=international_indices,
        adr_performance=adr_performance,
        watchlist=[],
    )


@router.get("/rankings")
async def get_rankings(
    by: str = Query("change", description="排序維度: change(漲幅) / change_desc(跌幅) / volume(量) / amount(額)"),
    limit: int = Query(20, ge=5, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    全市場排行榜（看盤終端式）

    以 DB 最新交易日的全市場行情計算：
    - change：漲幅排行（漲跌% 由高到低）
    - change_desc：跌幅排行
    - volume：成交量排行（張）
    - amount：成交金額排行（億元）

    過濾：成交量 < 10 張的冷門股不列入漲跌幅排行（避免一筆成交造成假漲停）。
    """
    from sqlalchemy import func as sa_func

    if by not in ("change", "change_desc", "volume", "amount"):
        raise HTTPException(status_code=400, detail="by 必須為 change / change_desc / volume / amount")

    # 最新兩個交易日
    dates_res = await db.execute(
        select(DailyBar.trade_date).distinct().order_by(DailyBar.trade_date.desc()).limit(2)
    )
    dates = [r for (r,) in dates_res.all()]
    if not dates:
        return {"trade_date": None, "items": []}
    latest_date = dates[0]
    prev_date = dates[1] if len(dates) > 1 else None

    bars_res = await db.execute(
        select(
            DailyBar.stock_code, DailyBar.trade_date, DailyBar.close_price,
            DailyBar.volume, DailyBar.amount,
        ).where(DailyBar.trade_date.in_(dates))
    )

    today: dict = {}
    prev_close: dict = {}
    for code, d, close, vol, amt in bars_res.all():
        if close is None:
            continue
        if d == latest_date:
            today[code] = {
                "close": float(close),
                "volume_lots": round(float(vol or 0) / 1000),
                "amount": float(amt) if amt else None,
            }
        elif d == prev_date:
            prev_close[code] = float(close)

    name_res = await db.execute(select(Stock.code, Stock.name))
    names = dict(name_res.all())

    items = []
    for code, t in today.items():
        prev = prev_close.get(code)
        change_pct = round((t["close"] - prev) / prev * 100, 2) if prev and prev > 0 else None
        items.append({
            "code": code,
            "name": names.get(code, code),
            "close": t["close"],
            "change_percent": change_pct,
            "volume_lots": t["volume_lots"],
            "amount_billion": round(t["amount"] / 1e8, 2) if t["amount"] else None,
        })

    if by in ("change", "change_desc"):
        # 漲跌幅排行需有前日收盤 + 最低流動性門檻
        items = [i for i in items if i["change_percent"] is not None and i["volume_lots"] >= 10]
        items.sort(key=lambda x: x["change_percent"], reverse=(by == "change"))
    elif by == "volume":
        items.sort(key=lambda x: x["volume_lots"], reverse=True)
    else:  # amount
        items = [i for i in items if i["amount_billion"] is not None]
        items.sort(key=lambda x: x["amount_billion"], reverse=True)

    return {"trade_date": str(latest_date), "by": by, "items": items[:limit]}


@router.get("/market-summary")
async def get_market_summary(
    db: AsyncSession = Depends(get_db),
):
    """
    盤後市場摘要

    - 加權指數收盤（含漲跌幅）
    - 今日個股漲跌幅排行（依 DB 中最新交易日的 daily_bars 計算）
    - 上漲/下跌家數統計
    """
    from worker.yahoo_worker import yahoo_worker
    from sqlalchemy import func as sa_func

    # 大盤指數
    indices = await yahoo_worker.fetch_index_data()
    taiex = indices.get("TAIEX")

    # DB 中最新交易日
    latest_res = await db.execute(select(sa_func.max(DailyBar.trade_date)))
    latest_date = latest_res.scalar_one_or_none()
    if not latest_date:
        return {"taiex": taiex, "trade_date": None, "gainers": [], "losers": [], "stats": {}}

    # 取最新兩個交易日的所有 bars，計算漲跌幅
    dates_res = await db.execute(
        select(DailyBar.trade_date)
        .distinct()
        .order_by(DailyBar.trade_date.desc())
        .limit(2)
    )
    dates = [r for (r,) in dates_res.all()]
    prev_date = dates[1] if len(dates) > 1 else None

    bars_res = await db.execute(
        select(DailyBar.stock_code, DailyBar.trade_date, DailyBar.close_price, DailyBar.volume)
        .where(DailyBar.trade_date.in_(dates))
    )
    today_close: dict = {}
    prev_close: dict = {}
    volumes: dict = {}
    for code, d, close, vol in bars_res.all():
        if close is None:
            continue
        if d == latest_date:
            today_close[code] = float(close)
            volumes[code] = float(vol or 0)
        elif d == prev_date:
            prev_close[code] = float(close)

    # 股票名稱
    name_res = await db.execute(select(Stock.code, Stock.name))
    names = dict(name_res.all())

    movers = []
    for code, close in today_close.items():
        prev = prev_close.get(code)
        if not prev or prev <= 0:
            continue
        change_pct = round((close - prev) / prev * 100, 2)
        movers.append({
            "code": code,
            "name": names.get(code, code),
            "close": close,
            "change_percent": change_pct,
            "volume_lots": round(volumes.get(code, 0) / 1000),
        })

    movers.sort(key=lambda x: x["change_percent"], reverse=True)
    up_count = sum(1 for m in movers if m["change_percent"] > 0)
    down_count = sum(1 for m in movers if m["change_percent"] < 0)

    return {
        "taiex": taiex,
        "trade_date": str(latest_date),
        "gainers": movers[:5],
        "losers": movers[-5:][::-1] if len(movers) > 5 else [],
        "movers": movers,  # 全部（供關注清單等對照現價）
        "stats": {
            "total": len(movers),
            "up": up_count,
            "down": down_count,
            "flat": len(movers) - up_count - down_count,
        },
    }


# 美股關聯：產業 → 對應指數
_INDUSTRY_US_INDICES: dict = {
    "半導體": ["SOX", "NASDAQ"],
    "電子": ["SOX", "NASDAQ"],
    "光電": ["SOX", "NASDAQ"],
    "電腦": ["NASDAQ", "SP500"],
    "通信": ["NASDAQ", "SP500"],
    "金融": ["DJI", "SP500"],
    "航運": ["DJI", "SP500"],
}


@router.get("/us-related/{stock_code}")
async def get_us_related(
    stock_code: str,
    db: AsyncSession = Depends(get_db),
):
    """
    個股美股關聯

    回傳該股的 ADR 報價（若有）+ 產業對應的美股指數（昨夜收盤）。
    美股收盤時為最近收盤價，正好反映台股盤前的隔夜情緒。
    """
    from worker.yahoo_worker import yahoo_worker, ADR_MAPPING

    related = []

    # 1. 該股 ADR
    if stock_code in ADR_MAPPING:
        adr = await yahoo_worker.fetch_adr_data(stock_code)
        for item in (adr or {}).values():
            related.append({
                "symbol": item["symbol"],
                "name": item["name"],
                "price": item["regular_market_price"],
                "change_percent": item["regular_market_change_percent"],
                "relation": "ADR",
            })

    # 2. 產業對應美股指數
    stmt = select(Stock.industry_name).where(Stock.code == stock_code)
    result = await db.execute(stmt)
    industry = result.scalar_one_or_none() or ""

    index_keys = ["SP500", "NASDAQ"]  # 預設
    for keyword, keys in _INDUSTRY_US_INDICES.items():
        if keyword in industry:
            index_keys = keys
            break

    indices = await yahoo_worker.fetch_index_data()
    for key in index_keys:
        item = indices.get(key)
        if item:
            related.append({
                "symbol": item["symbol"],
                "name": item["name"],
                "price": item["price"],
                "change_percent": item["change_percent"],
                "relation": "產業連動" if industry else "大盤連動",
            })

    return {"stock_code": stock_code, "industry": industry, "related": related}


# 注意：/screen 必須定義在 /{stock_code} 之前，否則會被動態路由攔截
@router.get("/screen")
async def screen_stocks(
    rsi_min: float = Query(0.0, ge=0, le=100, description="RSI 最低值"),
    rsi_max: float = Query(100.0, ge=0, le=100, description="RSI 最高值"),
    foreign_consecutive_buy: int = Query(0, description="外資連買至少 N 天 (0=不限)"),
    atr_pct_min: float = Query(0.0, ge=0, description="ATR14% 最低值（波動度下限，如 6 = 6%）"),
    atr_pct_max: float = Query(100.0, ge=0, description="ATR14% 最高值（波動度上限）"),
    adtv_min: float = Query(0.0, ge=0, description="10日均量下限（張）"),
    price_max: float = Query(0.0, ge=0, description="價格上限（0 = 不限）"),
    breakout_bars: int = Query(0, description="N根高點突破 (0=不篩, 20/60/120/180)"),
    limit: int = Query(20, ge=1, le=50, description="回傳數量"),
    db: AsyncSession = Depends(get_db),
):
    """
    股票篩選器（Graphcue 式波動度策略）

    篩選維度：
    - RSI 範圍、外資連買天數
    - ATR14%（波動度）、10日均量（流動性）、價格上限
    - N根高點突破（Donchian 通道突破，20/60/120/180 根）

    回傳欄位含 atr_pct / adtv_10 / breakout_60 / breakout_120 / breakout_180 / momentum_breakout
    """
    import numpy as np

    # 突破計算需要足夠歷史：180根 ≈ 270 個日曆天，抓 400 天保險
    need_days = 400 if breakout_bars >= 120 else 250

    # 全市場約 2,400 檔；個股優先掃描、ETF 殿後
    stmt = select(Stock.code, Stock.name).order_by(Stock.stock_type.desc(), Stock.code).limit(3000)
    result = await db.execute(stmt)
    all_stocks = result.all()

    screened = []

    for stock_code, stock_name in all_stocks:
        try:
            cutoff = datetime.now() - timedelta(days=need_days)
            bars_stmt = (
                select(DailyBar)
                .where(DailyBar.stock_code == stock_code, DailyBar.trade_date >= cutoff)
                .order_by(DailyBar.trade_date)
            )
            bars_res = await db.execute(bars_stmt)
            bars = bars_res.scalars().all()

            if len(bars) < 15:
                continue

            closes = [float(b.adjusted_close or b.close_price or 0) for b in bars]
            highs = [float(b.high_price or 0) for b in bars]
            lows = [float(b.low_price or 0) for b in bars]
            volumes = [float(b.volume or 0) for b in bars]
            price = closes[-1]
            if price <= 0:
                continue

            # 價格上限
            if price_max > 0 and price > price_max:
                continue

            # ATR14%（波動度）
            trs = []
            for i in range(1, len(bars)):
                h, l, pc = highs[i], lows[i], closes[i - 1]
                if h == 0 and l == 0:
                    continue
                trs.append(max(h - l, abs(h - pc), abs(l - pc)))
            atr14 = float(np.mean(trs[-14:])) if trs else 0.0
            atr_pct = round(atr14 / price * 100, 2) if price else 0.0
            if not (atr_pct_min <= atr_pct <= atr_pct_max):
                continue

            # 10日均量（張；DB volume 為股數）
            adtv_10 = round(float(np.mean(volumes[-10:])) / 1000, 1) if len(volumes) >= 10 else 0.0
            if adtv_min > 0 and adtv_10 < adtv_min:
                continue

            # N根高點突破（收盤 > 前 N 根最高點）+ 動能突破（突破前N根最高收盤且量 > 1.5×均量）
            def n_bar_breakout(n: int) -> bool:
                if len(bars) < n + 1:
                    return False
                return closes[-1] > max(highs[-n - 1:-1])

            def n_bar_momentum(n: int) -> bool:
                if len(bars) < n + 1 or adtv_10 <= 0:
                    return False
                vol_zhang = volumes[-1] / 1000
                return closes[-1] > max(closes[-n - 1:-1]) and vol_zhang > 1.5 * adtv_10

            breakouts = {
                "breakout_20": n_bar_breakout(20),
                "breakout_60": n_bar_breakout(60),
                "breakout_120": n_bar_breakout(120),
                "breakout_180": n_bar_breakout(180),
                "momentum_breakout": n_bar_momentum(60),
            }
            if breakout_bars > 0 and not n_bar_breakout(breakout_bars):
                continue

            # RSI14
            rsi_val = 50.0
            if len(closes) >= 15:
                gains, losses = [], []
                for i in range(1, len(closes)):
                    diff = closes[i] - closes[i - 1]
                    gains.append(max(diff, 0))
                    losses.append(max(-diff, 0))
                avg_gain = float(np.mean(gains[-14:])) if gains else 0
                avg_loss = float(np.mean(losses[-14:])) if losses else 0
                if avg_loss == 0:
                    rsi_val = 100.0
                else:
                    rs = avg_gain / avg_loss
                    rsi_val = round(100 - (100 / (1 + rs)), 1)
            if not (rsi_min <= rsi_val <= rsi_max):
                continue

            # 外資連買天數
            chip_cutoff = datetime.now() - timedelta(days=20)
            chip_stmt = (
                select(ChipData)
                .where(ChipData.stock_code == stock_code, ChipData.trade_date >= chip_cutoff)
                .order_by(ChipData.trade_date)
            )
            chip_res = await db.execute(chip_stmt)
            chip_rows = chip_res.scalars().all()

            consec_days = 0
            for row in reversed(chip_rows):
                foreign = float(row.foreign_net or 0)
                if foreign > 0:
                    consec_days += 1
                elif foreign < 0:
                    break

            if foreign_consecutive_buy > 0 and consec_days < foreign_consecutive_buy:
                continue

            screened.append({
                "code": stock_code,
                "name": stock_name,
                "price": round(price, 2),
                "rsi": rsi_val,
                "atr_pct": atr_pct,
                "adtv_10": adtv_10,
                **breakouts,
                "foreign_consecutive_days": consec_days,
                "latest_foreign_net": float(chip_rows[-1].foreign_net or 0) if chip_rows else 0,
            })

        except Exception:
            continue

        if len(screened) >= limit * 3:  # 過採樣後再截斷
            break

    # 排序：波動度優先（高→低），其次外資連買
    screened.sort(key=lambda x: (x["atr_pct"], x["foreign_consecutive_days"]), reverse=True)
    return {"results": screened[:limit], "total": len(screened)}


@router.get("/{stock_code}", response_model=StockResponse)
async def get_stock(
    stock_code: str,
    db: AsyncSession = Depends(get_db)
):
    """
    取得個股基本資料

    若本地資料庫沒有此股票，會自動：
    1. 從 Yahoo Finance 驗證股票存在
    2. 建立 Stock 記錄
    3. 背景抓取 3 年歷史 K 線
    """
    from fastapi import HTTPException
    import asyncio

    result = await db.execute(select(Stock).where(Stock.code == stock_code))
    stock = result.scalar_one_or_none()

    if not stock:
        # 嘗試從 Yahoo Finance 驗證並建立
        symbol = f"{stock_code}.TW"
        try:
            chart = await yahoo_worker.fetch_chart_data(symbol, period="5d", interval="1d")
            if not chart or "chart" not in chart or not chart["chart"]["result"]:
                raise HTTPException(status_code=404, detail=f"找不到股票代碼: {stock_code}")
            meta = chart["chart"]["result"][0].get("meta", {})
            name = meta.get("shortName") or meta.get("longName") or f"股票{stock_code}"
            # 清理名稱（Yahoo 常帶 " Co., Ltd." 等英文後綴）
            name = name.replace(" Co., Ltd.", "").replace(" Corporation", "").strip()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail=f"找不到股票代碼: {stock_code}")

        # 建立 Stock 記錄
        stock = Stock(
            code=stock_code,
            name=name,
            market="twse",
            stock_type="stock",
        )
        db.add(stock)
        await db.commit()
        await db.refresh(stock)

        # 背景抓取 3 年歷史 K 線（不阻塞回應）
        async def _bg_fetch():
            try:
                klines = await yahoo_worker.fetch_historical_kline(symbol, 1095)
                if klines:
                    await yahoo_worker.save_kline_data(stock_code, klines)
            except Exception:
                pass
        asyncio.create_task(_bg_fetch())

    return stock


@router.get("/{stock_code}/industry", response_model=StockWithIndustryResponse)
async def get_stock_industry(
    stock_code: str,
    db: AsyncSession = Depends(get_db)
):
    """
    取得個股的產業鏈關聯資訊
    
    包含上游、下游與同業個股
    """
    result = await db.execute(select(Stock).where(Stock.code == stock_code))
    stock = result.scalar_one_or_none()
    
    if not stock:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail=f"找不到股票代碼: {stock_code}"
        )
    
    # 取得產業鏈關聯
    chain_result = await db.execute(
        select(IndustryChain).where(IndustryChain.stock_code == stock_code)
    )
    chains = chain_result.scalars().all()
    
    return StockWithIndustryResponse(
        **stock.__dict__,
        industry_chains=[IndustryChainResponse(**c.__dict__) for c in chains]
    )


@router.get("/{stock_code}/kline", response_model=KLineResponse)
async def get_kline_data(
    stock_code: str,
    interval: str = Query("1d", description="K線週期: 1m, 5m, 15m, 1h, 1d, 1w, 1mo"),
    start_date: Optional[date] = Query(None, description="開始日期"),
    end_date: Optional[date] = Query(None, description="結束日期"),
    adjusted: bool = Query(True, description="是否使用還原權值"),
    limit: Optional[int] = Query(None, description="回傳筆數上限 (預設回傳全部)"),
    db: AsyncSession = Depends(get_db),
):
    """
    取得 K 線數據

    - **interval**: K線週期 (1m, 5m, 15m, 1h, 1d)
    - **start_date**: 開始日期
    - **end_date**: 結束日期
    - **adjusted**: 是否使用還原權值 (預設 True)
    - **limit**: 回傳筆數上限 (預設回傳全部)

    優先從本地 TimescaleDB 查詢，若無數據則從 Yahoo Finance 抓取並自動儲存
    """
    if not start_date:
        start_date = date.today() - timedelta(days=1095)  # 預設 3 年，確保 MA240 有足夠資料
    if not end_date:
        end_date = date.today()

    # 僅支援日 K 線從本地資料庫查詢
    if interval == "1d":
        query = (
            select(DailyBar)
            .where(
                DailyBar.stock_code == stock_code,
                DailyBar.trade_date >= start_date,
                DailyBar.trade_date <= end_date,
            )
            .order_by(DailyBar.trade_date)
        )
        result = await db.execute(query)
        bars = result.scalars().all()

        if bars:
            data = []
            for bar in bars:
                close_val = float(bar.adjusted_close) if adjusted and bar.adjusted_close else float(bar.close_price)
                data.append(KLinePoint(
                    date=bar.trade_date,
                    open=float(bar.open_price) if bar.open_price else None,
                    high=float(bar.high_price) if bar.high_price else None,
                    low=float(bar.low_price) if bar.low_price else None,
                    close=close_val,
                    adj_close=float(bar.adjusted_close) if bar.adjusted_close else None,
                    volume=int(bar.volume) if bar.volume else None,
                    amount=float(bar.amount) if bar.amount else None,
                ))
            return KLineResponse(
                stock_code=stock_code,
                interval=interval,
                adjusted=adjusted,
                data=data,
            )

    # 從 Yahoo Finance 抓取 (日 K 線本地無數據 或 分 K 線)
    yahoo_symbol = f"{stock_code}.TW"
    yahoo_interval = {
        "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
        "60m": "60m", "1h": "60m",
        "1d": "1d", "1w": "1wk", "1mo": "1mo",
    }.get(interval, "1d")

    # 各 interval 對應抓取期間：週/月線需要更長歷史
    yahoo_period_map = {
        "1d": "3y",
        "1w": "5y",   "1wk": "5y",
        "1mo": "max",
    }
    yahoo_period = yahoo_period_map.get(interval, "60d")  # 分K最多 60 天
    chart_data = await yahoo_worker.fetch_chart_data(
        yahoo_symbol, period=yahoo_period, interval=yahoo_interval
    )

    if not chart_data or "chart" not in chart_data or not chart_data["chart"]["result"]:
        return KLineResponse(
            stock_code=stock_code,
            interval=interval,
            adjusted=adjusted,
            data=[],
        )

    result_data = chart_data["chart"]["result"][0]
    timestamps = result_data.get("timestamp", [])
    indicators = result_data.get("indicators", {})
    quote = indicators.get("quote", [{}])[0]
    adjclose_list = indicators.get("adjclose", [{}])[0].get("adjclose", [])

    # Yahoo 間隔 -> 分鐘數 (用於分K儲存)
    interval_to_minutes = {
        "1m": 1, "5m": 5, "15m": 15, "30m": 30, "60m": 60,
    }

    # 解析所有 Yahoo 數據
    all_points: list[KLinePoint] = []
    for i, ts in enumerate(timestamps):
        dt = datetime.fromtimestamp(ts)

        open_val = quote.get("open", [None])[i] if "open" in quote else None
        high_val = quote.get("high", [None])[i] if "high" in quote else None
        low_val = quote.get("low", [None])[i] if "low" in quote else None
        close_val = quote.get("close", [None])[i] if "close" in quote else None
        volume_val = quote.get("volume", [None])[i] if "volume" in quote else None
        adj_val = adjclose_list[i] if i < len(adjclose_list) and adjclose_list[i] else None

        if adjusted and adj_val:
            final_close = adj_val
        else:
            final_close = close_val

        # 日/週/月 K 用 date；分 K 用完整 datetime
        point_date = dt.date() if interval in ("1d", "1w", "1mo") else dt

        all_points.append(KLinePoint(
            date=point_date,
            open=open_val,
            high=high_val,
            low=low_val,
            close=final_close,
            adj_close=adj_val,
            volume=volume_val,
        ))

    # 日 K 線：自動儲存到 DailyBar (避免重複從 Yahoo 抓取)
    if interval == "1d" and all_points:
        kline_records = [
            {
                "date": p.date,
                "open": p.open,
                "high": p.high,
                "low": p.low,
                "close": p.close,
                "adjclose": p.adj_close,
                "volume": p.volume,
            }
            for p in all_points
        ]
        try:
            saved = await yahoo_worker.save_kline_data(stock_code, kline_records)
        except Exception:
            # 儲存失敗不影響回傳
            pass

    # 分 K 線：自動儲存到 MinuteBar
    if interval != "1d" and interval_to_minutes.get(interval) and all_points:
        minutes = interval_to_minutes[interval]
        kline_records = [
            {
                "datetime": p.date,
                "open": p.open,
                "high": p.high,
                "low": p.low,
                "close": p.close,
                "volume": p.volume,
            }
            for p in all_points
        ]
        try:
            saved = await yahoo_worker.save_minute_kline_data(stock_code, minutes, kline_records)
        except Exception:
            # 儲存失敗不影響回傳
            pass

    # 根據 start_date / end_date 過濾
    filtered = []
    for p in all_points:
        p_date = p.date.date() if isinstance(p.date, datetime) else p.date
        if p_date < start_date or p_date > end_date:
            continue
        filtered.append(p)

    # 根據 limit 截斷
    if limit is not None and limit > 0:
        filtered = filtered[-limit:]

    return KLineResponse(
        stock_code=stock_code,
        interval=interval,
        adjusted=adjusted,
        data=filtered,
    )


@router.get("/{stock_code}/chip", response_model=ChipResponse)
async def get_chip_data(
    stock_code: str,
    days: int = Query(30, description="回看天數", ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """
    取得籌碼數據

    包含三大法人買賣超、融資融券數據
    數據來源: 本地 TimescaleDB (由 Worker 定期更新)
    """
    start_date = date.today() - timedelta(days=days)

    query = (
        select(ChipData)
        .where(
            ChipData.stock_code == stock_code,
            ChipData.trade_date >= start_date,
        )
        .order_by(ChipData.trade_date)
    )
    result = await db.execute(query)
    records = result.scalars().all()

    data = []
    for record in records:
        data.append(ChipDataPoint(
            date=record.trade_date,
            foreign_net=float(record.foreign_net) if record.foreign_net else None,
            trust_net=float(record.trust_net) if record.trust_net else None,
            proprietary_net=float(record.proprietary_net) if record.proprietary_net else None,
            margin_balance=float(record.margin_balance) if record.margin_balance else None,
            margin_net=float(record.margin_net) if record.margin_net else None,
        ))

    return ChipResponse(
        stock_code=stock_code,
        days=days,
        data=data,
    )


