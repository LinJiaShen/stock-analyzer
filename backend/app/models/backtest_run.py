"""
回測結果（Backtest Run）模型

保存每次回測的參數、績效指標與權益曲線，供前端列表/回顧。
"""
import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship

from app.database import Base


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(100), nullable=True)

    params = Column(JSONB, nullable=False)        # 回測參數
    metrics = Column(JSONB, nullable=False)        # 績效指標
    equity_curve = Column(JSONB, nullable=False)   # [{date, equity}]

    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())

    user = relationship("User", backref="backtest_runs")

    def __repr__(self):
        return f"<BacktestRun(id='{self.id}', label='{self.label}')>"
