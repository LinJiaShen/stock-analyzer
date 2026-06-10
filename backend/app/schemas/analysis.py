"""
分析結果 Schema
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class DiagnosticResponse(BaseModel):
    id: UUID
    holding_id: UUID
    score: Optional[int] = None
    technical_score: Optional[int] = None
    chip_score: Optional[int] = None
    fundamental_score: Optional[int] = None
    sentiment_score: Optional[int] = None
    health_level: Optional[str] = None
    summary: Optional[str] = None
    analyzed_at: datetime
    
    class Config:
        from_attributes = True


class SentimentResponse(BaseModel):
    id: int
    time: datetime
    stock_code: Optional[str] = None
    source: Optional[str] = None
    sentiment_score: Optional[Decimal] = None
    confidence: Optional[Decimal] = None
    raw_text: Optional[str] = None
    llm_summary: Optional[str] = None
    
    class Config:
        from_attributes = True


class RadarChartData(BaseModel):
    """雷達圖數據"""
    value: int  # 價值
    momentum: int  # 動能
    chip: int  # 籌碼
    growth: int  # 成長
    resistance: int  # 抗跌


class ScoreResponse(BaseModel):
    """多因子評分回應"""
    stock_code: str
    stock_name: str
    total_score: int
    technical_score: int
    chip_score: int
    fundamental_score: int
    sentiment_score: int
    health_level: str
    radar: RadarChartData
    analyzed_at: datetime
