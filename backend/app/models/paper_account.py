"""
模擬交易帳戶（Paper Account）模型

每位使用者一個帳戶，紀錄本金（initial_capital）。
可用餘額、報酬率、回撤等皆由本金 + 模擬單損益即時計算，不落地儲存，
僅 peak_equity（權益高點）持久化以追蹤最大回撤。

金額單位 = 元。
"""
import uuid

from sqlalchemy import Column, Numeric, DateTime, ForeignKey, String, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship

from app.database import Base

DEFAULT_INITIAL_CAPITAL = 1_000_000  # 預設本金 100 萬元


class PaperAccount(Base):
    __tablename__ = "paper_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # 一人一帳戶
        index=True,
    )

    # 本金（元）
    initial_capital = Column(Numeric(16, 0), nullable=False, default=DEFAULT_INITIAL_CAPITAL)
    # 權益高點（元）— 用於計算最大回撤，由 stats 端點滾動更新
    peak_equity = Column(Numeric(16, 0), nullable=True)

    # 券商手續費折數（1.0 = 無折扣，0.6 = 6 折），用於計算交易成本
    fee_discount = Column(Numeric(4, 3), nullable=False, default=1.0, server_default="1.0")

    # 自動交易模式：off（停用）/ semi（AI 出單、人確認）/ auto（全權交給 AI）
    auto_trade_mode = Column(String(10), nullable=False, default="off", server_default="off")

    # 風控參數（皆可於 UI 調整）
    risk_per_trade_pct = Column(Numeric(5, 2), nullable=False, default=2.0, server_default="2.0")          # 每筆風險占本金 %
    max_position_pct = Column(Numeric(5, 2), nullable=False, default=20.0, server_default="20.0")          # 單一持股上限（% 權益）
    max_total_exposure_pct = Column(Numeric(5, 2), nullable=False, default=100.0, server_default="100.0")  # 總曝險上限（% 權益）
    daily_loss_limit_pct = Column(Numeric(5, 2), nullable=False, default=3.0, server_default="3.0")        # 每日虧損熔斷 %
    max_consecutive_losses = Column(Integer, nullable=False, default=5, server_default="5")                # 連敗暫停當日開倉門檻
    max_positions = Column(Integer, nullable=False, default=5, server_default="5")                         # 最多同時持倉數

    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now())

    user = relationship("User", backref="paper_account")

    def __repr__(self):
        return f"<PaperAccount(user_id='{self.user_id}', capital={self.initial_capital})>"
