"""
交易日誌模型
"""
from sqlalchemy import Column, String, Text, DateTime, Date, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func as sql_func
from app.database import Base
import uuid


class TradeJournal(Base):
    """交易日誌表"""
    __tablename__ = "trade_journals"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    journal_date = Column(Date, nullable=False)
    market_summary = Column(Text)  # 市場總結
    key_breakouts = Column(JSONB)  # 關鍵突破個股
    potential_risks = Column(JSONB)  # 潛在風險
    recommendations = Column(JSONB)  # 操作建議
    llm_analysis = Column(Text)  # LLM 深度分析
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    
    def __repr__(self):
        return f"<TradeJournal(user_id='{self.user_id}', date='{self.journal_date}')>"
