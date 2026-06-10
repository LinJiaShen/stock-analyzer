"""
分析結果模型
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class HoldingDiagnostic(Base):
    """持股健診結果表"""
    __tablename__ = "holding_diagnostics"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    holding_id = Column(UUID(as_uuid=True), ForeignKey("holdings.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer)  # 綜合評分 0-100
    technical_score = Column(Integer)  # 技術面評分
    chip_score = Column(Integer)  # 籌碼面評分
    fundamental_score = Column(Integer)  # 基本面評分
    sentiment_score = Column(Integer)  # 情緒面評分
    health_level = Column(String(20))  # 健康等級: 強勢/偏多/中性/偏空/弱勢
    summary = Column(Text)  # LLM 生成的健診摘要
    analyzed_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    
    # 關聯
    holding = relationship("Holding", back_populates="diagnostics")
    
    def __repr__(self):
        return f"<HoldingDiagnostic(score={self.score}, level='{self.health_level}')>"


class SentimentData(Base):
    """情緒數據表 - 時間序列"""
    __tablename__ = "sentiment_data"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    time = Column(DateTime(timezone=True), nullable=False, index=True)
    stock_code = Column(String(10), index=True)  # NULL 表示大盤情緒
    source = Column(String(50))  # ptt, mobile01, news
    sentiment_score = Column(Numeric(5, 4))  # -1.0 到 1.0
    confidence = Column(Numeric(5, 4))  # 置信度
    raw_text = Column(Text)
    llm_summary = Column(Text)
    
    def __repr__(self):
        return f"<SentimentData(stock='{self.stock_code}', score={self.sentiment_score})>"
