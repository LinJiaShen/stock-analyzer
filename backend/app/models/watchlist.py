"""
追蹤清單模型
"""
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class WatchlistItem(Base):
    __tablename__ = "watchlist"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    stock_code = Column(String(10), nullable=False)
    note = Column(Text, nullable=True)
    added_at = Column(DateTime(timezone=True), server_default=sql_func.now())

    user = relationship("User", backref="watchlist_items")

    __table_args__ = (UniqueConstraint("user_id", "stock_code", name="uq_watchlist_user_stock"),)

    def __repr__(self):
        return f"<WatchlistItem(user_id='{self.user_id}', stock_code='{self.stock_code}')>"
