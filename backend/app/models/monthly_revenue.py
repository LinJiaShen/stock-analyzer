"""
月營收模型

台股每月 10 號公布的月營收（領先指標）。來源 TWSE/TPEx MOPS OpenAPI，
已含年增率(YoY)、月增率(MoM)、累計營收與累計年增率。單位：千元。
每股票每月一筆，以 (stock_code, revenue_month) upsert。
"""
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func as sql_func

from app.database import Base


class StockMonthlyRevenue(Base):
    __tablename__ = "stock_monthly_revenue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_code = Column(String(10), ForeignKey("stocks.code", ondelete="CASCADE"), nullable=False, index=True)
    revenue_month = Column(Date, nullable=False)   # 該月 1 號
    revenue = Column(Numeric(18, 0))               # 當月營收（千元）
    mom_pct = Column(Numeric(10, 2))               # 月增率 %
    yoy_pct = Column(Numeric(10, 2))               # 年增率 %
    cum_revenue = Column(Numeric(18, 0))           # 累計營收（千元）
    cum_yoy_pct = Column(Numeric(10, 2))           # 累計年增率 %
    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now())

    stock = relationship("Stock", backref="monthly_revenue")

    __table_args__ = (
        UniqueConstraint("stock_code", "revenue_month", name="uq_revenue_code_month"),
    )

    def __repr__(self):
        return f"<StockMonthlyRevenue(code='{self.stock_code}', month='{self.revenue_month}', yoy={self.yoy_pct})>"
