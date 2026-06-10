"""
分析引擎路由
整合技術分析、籌碼分析、情緒分析、產業鏈分析
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.utils.security import get_current_user
from app.services.technical import TechnicalService
from app.services.chip import ChipService
from app.services.sentiment import SentimentService
from app.services.industry import IndustryService

router = APIRouter(prefix="/api/analysis", tags=["深度分析"])


@router.get("/technical/{stock_code}")
async def get_technical_analysis(
    stock_code: str,
    period: str = Query("medium", description="分析週期: short, medium, long"),
    db: AsyncSession = Depends(get_db),
):
    """
    技術分析結果

    包含 K 線形態、均線排列、RSI、MACD、KDJ、布林帶等指標
    """
    service = TechnicalService(db)
    try:
        result = await service.analyze(stock_code, period)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/chip/{stock_code}")
async def get_chip_analysis(
    stock_code: str,
    days: int = Query(90, ge=1, le=365, description="分析天數"),
    db: AsyncSession = Depends(get_db),
):
    """
    籌碼分析結果

    包含法人動向、融資融券趨勢、籌碼集中度
    """
    service = ChipService(db)
    try:
        result = await service.analyze(stock_code, days)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sentiment/{stock_code}")
async def get_sentiment_analysis(
    stock_code: str,
    days: int = Query(7, ge=1, le=90, description="分析天數"),
    db: AsyncSession = Depends(get_db),
):
    """
    情緒分析結果

    基於 LLM 分析新聞與論壇文本
    """
    service = SentimentService(db)
    try:
        result = await service.analyze(stock_code, days)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/industry/{stock_code}")
async def get_industry_analysis(
    stock_code: str,
    days: int = Query(30, ge=1, le=365, description="分析天數"),
    db: AsyncSession = Depends(get_db),
):
    """
    產業鏈分析

    找出上下游事業群、同業比較與具補漲潛力的個股
    """
    service = IndustryService(db)
    try:
        result = await service.analyze(stock_code, days)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/overview/{stock_code}")
async def get_analysis_overview(
    stock_code: str,
    db: AsyncSession = Depends(get_db),
):
    """
    綜合分析總覽

    一次性取得所有維度的分析結果與綜合評分
    """
    tech_service = TechnicalService(db)
    chip_service = ChipService(db)
    sentiment_service = SentimentService(db)
    industry_service = IndustryService(db)

    try:
        technical = await tech_service.analyze(stock_code, "medium")
        chip = await chip_service.analyze(stock_code, 90)
        sentiment = await sentiment_service.analyze(stock_code, 7)
        industry = await industry_service.analyze(stock_code, 30)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 加權綜合評分
    weights = {
        "technical": 0.35,
        "chip": 0.25,
        "sentiment": 0.15,
        "industry": 0.25,
    }

    composite_score = (
        technical.get("score", 50) * weights["technical"]
        + chip.get("score", 50) * weights["chip"]
        + sentiment.get("score", 50) * weights["sentiment"]
        + industry.get("score", 50) * weights["industry"]
    )
    composite_score = round(composite_score, 1)

    # 綜合訊號
    if composite_score >= 70:
        overall_signal = "strong_buy"
    elif composite_score >= 60:
        overall_signal = "buy"
    elif composite_score >= 40:
        overall_signal = "neutral"
    elif composite_score >= 30:
        overall_signal = "sell"
    else:
        overall_signal = "strong_sell"

    return {
        "stock_code": stock_code,
        "composite_score": composite_score,
        "overall_signal": overall_signal,
        "weights": weights,
        "technical": technical,
        "chip": chip,
        "sentiment": sentiment,
        "industry": industry,
    }


@router.post("/batch")
async def batch_analysis(
    stock_codes: List[str],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    批次分析 (選股模型)

    對多個股票執行完整的多因子分析 (最多 20 檔)
    """
    if len(stock_codes) > 20:
        raise HTTPException(status_code=400, detail="最多同時分析 20 檔股票")

    tech_service = TechnicalService(db)
    chip_service = ChipService(db)
    industry_service = IndustryService(db)

    results = []
    for code in stock_codes:
        try:
            technical = await tech_service.analyze(code, "medium")
            chip = await chip_service.analyze(code, 90)
            industry = await industry_service.analyze(code, 30)

            # 簡化評分 (不含情緒分析以加速)
            score = (
                technical.get("score", 50) * 0.4
                + chip.get("score", 50) * 0.3
                + industry.get("score", 50) * 0.3
            )

            results.append({
                "stock_code": code,
                "score": round(score, 1),
                "technical_signal": technical.get("signal"),
                "chip_signal": chip.get("signal"),
                "industry_signal": industry.get("signal"),
            })
        except Exception as e:
            results.append({
                "stock_code": code,
                "error": str(e),
            })

    # 依分數排序
    results.sort(key=lambda x: x.get("score", 0), reverse=True)

    return {
        "stock_codes": stock_codes,
        "results": results,
        "total": len(results),
    }
