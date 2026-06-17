"""
模擬帳戶每日權益快照

每交易日收盤後記錄一筆權益（現金 + 持倉市值），用於計算真正的
日報酬夏普 / Sortino / 歷史最大回撤。每帳戶每日一筆（upsert）。
"""
import uuid

from sqlalchemy import Column, Numeric, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func as sql_func

from app.database import Base


class PaperEquitySnapshot(Base):
    __tablename__ = "paper_equity_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False)
    equity = Column(Numeric(16, 0), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "snapshot_date", name="uq_equity_snap_user_date"),
    )

    def __repr__(self):
        return f"<PaperEquitySnapshot(user='{self.user_id}', date='{self.snapshot_date}', equity={self.equity})>"
