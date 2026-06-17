"""
自訂預警規則

使用者對自選股設定條件（突破/爆量/外資連買/跌破均線等），盤後掃描比對，
觸發時寫入 notifications（複用站內通知 + 鈴鐺）。每規則每日最多觸發一次。
"""
import uuid

from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship

from app.database import Base


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_code = Column(String(10), nullable=False)
    stock_name = Column(String(100), nullable=True)
    rule_type = Column(String(30), nullable=False)   # price_above / price_below / breakout / volume_spike / ma_break_below / ma_break_above / foreign_streak
    params = Column(JSONB, nullable=False, default=dict)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())

    user = relationship("User", backref="alert_rules")

    __table_args__ = (
        Index("ix_alert_rules_user_enabled", "user_id", "enabled"),
    )

    def __repr__(self):
        return f"<AlertRule(code='{self.stock_code}', type='{self.rule_type}')>"
