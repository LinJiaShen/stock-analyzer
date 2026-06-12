"""
決策工具路由
整合多因子評分、雷達圖、決策樹訊號、每日推薦
"""

from typing import List, Optional
from datetime import datetime, date

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.score_history import ScoreHistory
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
    - 籌碼面 (20%)
    - 基本/產業面 (15%)
    - 情緒面 (15%)
    - K線形態 (20%)
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


@router.get("/ai-analysis/{stock_code}")
async def get_ai_analysis(
    stock_code: str,
    db: AsyncSession = Depends(get_db),
):
    """
    AI 綜合分析

    彙整評分、技術、籌碼、新聞數據，由本地 LLM（Ollama）生成：
    - 為什麼是這個分數（summary）
    - 多空觀點（bullish_points / bearish_points）
    - 風險提醒（risks）
    - 操作建議（suggestion）與分析視角（perspective）

    LLM 不可用時回傳規則式 fallback（source = "rule"）
    """
    from app.services.llm import llm_service
    from app.services.technical import TechnicalService
    from app.services.chip import ChipService
    from app.services.sentiment import SentimentService
    from app.models.stock import Stock

    scoring = ScoringService(db)
    try:
        score = await scoring.calculate_composite_score(stock_code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 收集脈絡數據
    name_res = await db.execute(select(Stock.name).where(Stock.code == stock_code))
    stock_name = name_res.scalar_one_or_none() or stock_code

    try:
        tech = await TechnicalService(db).analyze(stock_code, "medium")
        tech_detail = {
            "rsi": tech.get("rsi"),
            "macd": tech.get("macd"),
            "ma_alignment": tech.get("ma_alignment"),
            "trend": tech.get("trend"),
        }
    except Exception:
        tech_detail = {}

    try:
        chip = await ChipService(db).analyze(stock_code, 90)
        chip_detail = {
            "foreign_consecutive_days": chip.get("dealer_flow", {}).get("foreign_consecutive_days"),
            "signal": chip.get("signal"),
        }
    except Exception:
        chip_detail = {}

    try:
        news = await SentimentService(db).get_recent_news(stock_code, days=7, limit=6)
        news_brief = [{"title": n["title"], "score": n["sentiment_score"]} for n in news]
    except Exception:
        news_brief = []

    context = {
        "stock_code": stock_code,
        "stock_name": stock_name,
        "analyzed_date": datetime.now().strftime("%Y%m%d"),
        "total_score": score.get("total_score"),
        "technical_score": score.get("technical_score"),
        "chip_score": score.get("chip_score"),
        "fundamental_score": score.get("fundamental_score"),
        "sentiment_score": score.get("sentiment_score"),
        "technical_detail": tech_detail,
        "chip_detail": chip_detail,
        "patterns": [{"name": p.get("name"), "date": p.get("date")} for p in (score.get("recent_patterns") or [])[:5]],
        "news": news_brief,
        "current_price": score.get("current_price"),
        "support": score.get("support"),
        "resistance": score.get("resistance"),
        "atr_14": score.get("atr_14"),
    }

    analysis = await llm_service.analyze_stock(context)
    if analysis:
        return {"source": "llm", "model": llm_service.model, **analysis}

    # 規則式 fallback：從因子數據組裝可讀解釋
    total = score.get("total_score") or 0
    bullish, bearish, risks = [], [], []

    tech_score = score.get("technical_score") or 50
    if tech_score >= 60:
        bullish.append(f"技術面 {tech_score} 分偏多（{tech_detail.get('ma_alignment', '')}）")
    elif tech_score <= 40:
        bearish.append(f"技術面 {tech_score} 分偏弱（{tech_detail.get('ma_alignment', '')}）")

    chip_score = score.get("chip_score") or 50
    fdays = chip_detail.get("foreign_consecutive_days") or 0
    if fdays > 2:
        bullish.append(f"外資連買 {fdays} 天，籌碼面轉強")
    elif fdays < -2:
        bearish.append(f"外資連賣 {abs(fdays)} 天，籌碼面轉弱")

    pos_news = [n for n in news_brief if n["score"] > 0.1]
    neg_news = [n for n in news_brief if n["score"] < -0.1]
    if pos_news:
        bullish.append(f"近期 {len(pos_news)} 則利多新聞（如：{pos_news[0]['title'][:25]}）")
    if neg_news:
        bearish.append(f"近期 {len(neg_news)} 則利空新聞（如：{neg_news[0]['title'][:25]}）")

    if score.get("atr_14") and score.get("current_price"):
        atr_pct = score["atr_14"] / score["current_price"] * 100
        if atr_pct > 4:
            risks.append(f"波動度偏高（ATR {atr_pct:.1f}%），單日震幅大，注意停損紀律")
    risks.append("評分為量化模型結果，重大訊息（財報、法說）可能使指標短期失真")

    level_text = "偏多" if total >= 60 else "偏空" if total <= 40 else "中性盤整"
    return {
        "source": "rule",
        "model": None,
        "summary": f"綜合評分 {total} 分（{level_text}）。技術 {tech_score}、籌碼 {chip_score}、情緒 {score.get('sentiment_score')}、基本 {score.get('fundamental_score')} 加權而成，目前無單一維度出現極端訊號。" if not (bullish or bearish) else f"綜合評分 {total} 分（{level_text}），主要受以下因素影響。",
        "bullish_points": bullish or ["暫無明確利多因素"],
        "bearish_points": bearish or ["暫無明確利空因素"],
        "risks": risks,
        "suggestion": f"支撐 {score.get('support')} / 壓力 {score.get('resistance')}，跌破支撐減碼、突破壓力可加碼" if score.get("support") else "等待更多數據累積後再行動",
        "perspective": "量化規則彙整（LLM 服務未啟用時的替代分析）",
    }


@router.get("/score-history/{stock_code}")
async def get_score_history(
    stock_code: str,
    days: int = Query(30, ge=1, le=365, description="查詢天數"),
    db: AsyncSession = Depends(get_db),
):
    """
    評分歷史趨勢

    回傳最近 N 天的每日評分快照，供趨勢折線圖使用
    """
    from datetime import timedelta
    cutoff = datetime.now().date() - timedelta(days=days)
    stmt = (
        select(ScoreHistory)
        .where(ScoreHistory.stock_code == stock_code, ScoreHistory.trade_date >= cutoff)
        .order_by(ScoreHistory.trade_date)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "trade_date": str(r.trade_date),
            "total_score": float(r.total_score or 0),
            "technical_score": float(r.technical_score or 0),
            "chip_score": float(r.chip_score or 0),
            "fundamental_score": float(r.fundamental_score or 0),
            "sentiment_score": float(r.sentiment_score or 0),
        }
        for r in rows
    ]
