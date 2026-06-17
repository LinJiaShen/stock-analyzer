"""
站內通知

AI 自動開倉 / 建議、TP/SL 成交、風控熔斷時由 worker 寫入，前端鈴鐺輪詢顯示。
"""
import uuid

from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func as sql_func

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(20), nullable=False)   # open / proposed / fill / blocked
    message = Column(Text, nullable=False)
    read = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())

    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "read"),
    )

    def __repr__(self):
        return f"<Notification(user='{self.user_id}', type='{self.type}')>"
