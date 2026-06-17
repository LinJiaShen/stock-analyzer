"""
模擬單（Paper Trade）模型

參考 Graphcue 持倉列表設計：
- 進場：時間/價格/數量（張）
- 出場：exits JSONB 陣列，每筆 = {type: "tp"|"sl", seq: 1-3, price, quantity,
         filled_time, filled_price}（price 為計畫價，filled_* 為實際成交）
- 狀態：open（持倉中）/ partial（部分平倉）/ closed（已平倉）
- 已實現損益由 filled exits 計算；未實現損益以最新收盤價計算
"""
import uuid

from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship

from app.database import Base


class PaperTrade(Base):
    __tablename__ = "paper_trades"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    strategy = Column(String(50), nullable=True)  # 策略名稱（如 mid_extreme_vol）
    stock_code = Column(String(10), nullable=False)
    stock_name = Column(String(100), nullable=True)

    # 進場
    entry_time = Column(DateTime(timezone=True), server_default=sql_func.now())
    entry_price = Column(Numeric(12, 2), nullable=False)
    quantity = Column(Numeric(10, 0), nullable=False)  # 張

    # 出場計畫與實際成交（JSONB 陣列）
    exits = Column(JSONB, nullable=False, default=list)

    # 狀態
    status = Column(String(10), nullable=False, default="open")  # open / partial / closed
    remaining_quantity = Column(Numeric(10, 0), nullable=False)
    realized_pnl = Column(Numeric(14, 0), nullable=False, default=0)  # 元

    note = Column(Text, nullable=True)
    # AI 開倉時的決策快照（評分分項/總分/ATR/風報比/信度），供事後檢討「為何買這檔」
    decision_snapshot = Column(JSONB, nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())

    user = relationship("User", backref="paper_trades")

    __table_args__ = (
        Index("ix_paper_trades_user_status", "user_id", "status"),
    )

    def __repr__(self):
        return f"<PaperTrade(stock='{self.stock_code}', status='{self.status}', qty={self.quantity})>"
