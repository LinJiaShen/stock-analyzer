"""
決策工具路由
整合多因子評分、雷達圖、決策樹訊號、每日推薦
"""

from typing import List, Optional
from datetime import datetime, date

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.utils.security import get_current_user
from app.services.scoring import ScoringService

router = APIRouter(prefix="/api/decision", tags=["決策工具"])


@router.get("/score/{stock_code}")
async def get_score(
    stock_code: str,
    db: AsyncSession = Depends(get_db),
):
    """
    多因子綜合評分

    回傳 0-100 的綜合戰鬥力分數
    - 技術面 (30%)
    - 籌碼面 (30%)
    - 基本/產業面 (20%)
    - 情緒面 (20%)
    """
    service = ScoringService(db)
    try:
        result = await service.calculate_composite_score(stock_code)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/radar/{stock_code}")
async def get_radar(
    stock_code: str,
    db: AsyncSession = Depends(get_db),
):
    """
    雷達圖數據

    五角雷達圖: 價值、動能、籌碼、成長、抗跌
    """
    service = ScoringService(db)
    try:
        result = await service.calculate_radar_data(stock_code)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/signals")
async def get_signals(
    stock_code: Optional[str] = Query(None, description="特定股票代碼"),
    level: str = Query("all", description="訊號等級: strong, watch, sell, all"),
    db: AsyncSession = Depends(get_db),
):
    """
    決策樹觸發訊號

    基於決策樹規則產生的操作建議
    """
    if level not in ("strong", "watch", "sell", "all"):
        raise HTTPException(status_code=400, detail="level 必須為 strong, watch, sell, all 之一")

    service = ScoringService(db)
    try:
        signals = await service.generate_signals(stock_code, level)
        return {
            "signals": signals,
            "filters": {
                "stock_code": stock_code,
                "level": level,
            },
            "total": len(signals),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/recommendations")
async def get_recommendations(
    date_param: Optional[date] = Query(None, description="日期，預設今天"),
    min_score: int = Query(70, description="最低評分門檻", ge=0, le=100),
    limit: int = Query(10, description="回傳數量", ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    每日推薦潛力股

    基於多因子評分與決策樹規則篩選
    """
    service = ScoringService(db)
    try:
        recommendations = await service.get_recommendations(min_score, limit)
        return {
            "date": date_param or datetime.now().date(),
            "min_score": min_score,
            "recommendations": recommendations,
            "total": len(recommendations),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
