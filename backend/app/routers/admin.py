"""
系統管理路由
- 股票列表同步
- 歷史數據批量初始化
"""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.stock import Stock
from app.schemas.user import UserResponse
from app.utils.security import get_current_active_user
from app.config import settings
from worker.stock_list_worker import stock_list_worker, sync_stock_list
from worker.yahoo_worker import yahoo_worker
from sqlalchemy import select, func

async def get_admin_user():
    """
    管理員認證依賴 - 開發環境跳過認證
    在生產環境下會要求有效的 JWT token
    """
    if settings.ENV != "development":
        return await get_current_active_user()
    return None

router = APIRouter(prefix="/api/admin", tags=["系統管理"])


class InitResponse(BaseModel):
    status: str
    message: str
    data: Optional[dict] = None


@router.post("/sync-stocks", response_model=InitResponse)
async def sync_stocks_endpoint(
    category: str = Query("all", description="同步類別: all, twse, tpex, etf"),
    current_user: Optional[UserResponse] = Depends(get_admin_user),
):
    """
    同步股票列表

    從 TWSE/TPEx 抓取最新的股票代碼列表並同步到資料庫

    - **category**: 同步類別 (all=全部, twse=上市, tpex=上櫃, etf=ETF)
    """
    try:
        result = await sync_stock_list(category)
        return InitResponse(
            status="success",
            message=f"股票列表同步完成: {result}",
            data=result,
        )
    except Exception as e:
        return InitResponse(
            status="error",
            message=f"同步失敗: {str(e)}",
        )


@router.post("/init-historical-data", response_model=InitResponse)
async def init_historical_data_endpoint(
    stock_codes: Optional[str] = Query(None, description="股票代碼，多個用逗號分隔 (例: 2330,2454,0050)"),
    days: int = Query(365, description="歷史天數", ge=30, le=3650),
    current_user: Optional[UserResponse] = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    批量初始化歷史 K 線數據

    從 Yahoo Finance 抓取指定股票的歷史 K 線數據並存入資料庫

    - **stock_codes**: 指定股票代碼 (不指定則抓取資料庫中所有股票)
    - **days**: 歷史天數 (預設 365 天，最大 3650 天約 10 年)
    """
    # 取得要抓取的股票代碼列表
    if stock_codes:
        codes = [c.strip() for c in stock_codes.split(",") if c.strip()]
    else:
        # 預設抓取資料庫中所有股票
        result = await db.execute(select(Stock.code))
        codes = [row[0] for row in result.all()]

    if not codes:
        return InitResponse(
            status="error",
            message="沒有找到股票代碼",
        )

    # 限制一次最多 50 支股票
    if len(codes) > 50:
        codes = codes[:50]

    results = {}
    errors = []

    for code in codes:
        try:
            symbol = f"{code}.TW"
            klines = await yahoo_worker.fetch_historical_kline(symbol, days)
            if klines:
                saved = await yahoo_worker.save_kline_data(code, klines)
                results[code] = {"saved": saved, "total": len(klines)}
            else:
                errors.append(code)
            # 速率限制 - 每支股票間隔 0.5 秒
            await asyncio.sleep(0.5)
        except Exception as e:
            errors.append(f"{code}: {str(e)}")

    return InitResponse(
        status="success",
        message=f"歷史數據初始化完成: 成功 {len(results)} 支, 失敗 {len(errors)} 支",
        data={
            "success": results,
            "errors": errors,
            "total": len(codes),
        },
    )


@router.get("/stock-count", response_model=InitResponse)
async def get_stock_count(
    db: AsyncSession = Depends(get_db),
):
    """
    取得資料庫中股票數量統計
    """
    total = (await db.execute(select(func.count()).select_from(Stock))).scalar()
    twse = (await db.execute(
        select(func.count()).where(Stock.market == "twse")
    )).scalar()
    tpex = (await db.execute(
        select(func.count()).where(Stock.market == "tpex")
    )).scalar()
    etf = (await db.execute(
        select(func.count()).where(Stock.stock_type == "etf")
    )).scalar()

    return InitResponse(
        status="success",
        message="股票數量統計",
        data={
            "total": total,
            "twse": twse,
            "tpex": tpex,
            "etf": etf,
        },
    )
