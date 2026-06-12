"""
評分歷史模型 - 儲存每日評分快照，供趨勢圖使用
"""
from sqlalchemy import Column, String, Date, Numeric, UniqueConstraint, Index
from app.database import Base


class ScoreHistory(Base):
    __tablename__ = "score_history"

    # 使用複合主鍵（不需自增 ID）
    stock_code = Column(String(10), nullable=False, primary_key=True)
    trade_date = Column(Date, nullable=False, primary_key=True)

    total_score = Column(Numeric(5, 1))
    technical_score = Column(Numeric(5, 1))
    chip_score = Column(Numeric(5, 1))
    fundamental_score = Column(Numeric(5, 1))
    sentiment_score = Column(Numeric(5, 1))

    __table_args__ = (
        Index("ix_score_history_code_date", "stock_code", "trade_date"),
    )

    def __repr__(self):
        return f"<ScoreHistory(code='{self.stock_code}', date='{self.trade_date}', score={self.total_score})>"
