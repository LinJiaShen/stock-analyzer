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


@router.get("/{stock_code}", response_model=StockResponse)
async def get_stock(
    stock_code: str,
    db: AsyncSession = Depends(get_db)
):
    """取得個股基本資料"""
    result = await db.execute(select(Stock).where(Stock.code == stock_code))
    stock = result.scalar_one_or_none()
    
    if not stock:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail=f"找不到股票代碼: {stock_code}"
        )
    
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
    interval: str = Query("1d", description="K線週期: 1m, 5m, 15m, 1h, 1d"),
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
        start_date = date.today() - timedelta(days=365)
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

    chart_data = await yahoo_worker.fetch_chart_data(
        yahoo_symbol, period="1y", interval=yahoo_interval
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

        # 分 K 線使用完整 datetime，日 K 線使用 date
        point_date = dt if interval != "1d" else dt.date()

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
