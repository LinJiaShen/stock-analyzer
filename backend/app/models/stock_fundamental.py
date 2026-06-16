"""
個股基本面快照（Stock Fundamental）模型

來源：yfinance Ticker.info（每檔一列，定期更新）。
僅儲存緩慢變動的估值/獲利指標，供個股/決策頁顯示與基本面解讀。

注意：本平台無歷史本益比序列，故估值判斷以
「forward PE vs trailing PE」與「ROE」等當下可得指標為主，不杜撰歷史均值。
"""
from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func as sql_func

from app.database import Base


class StockFundamental(Base):
    __tablename__ = "stock_fundamentals"

    stock_code = Column(String(10), ForeignKey("stocks.code", ondelete="CASCADE"), primary_key=True)

    pe_ratio = Column(Numeric(12, 2), nullable=True)        # 本益比（trailing PE）
    forward_pe = Column(Numeric(12, 2), nullable=True)      # 預估本益比（forward PE）
    pb_ratio = Column(Numeric(12, 2), nullable=True)        # 本淨比（price-to-book）
    eps = Column(Numeric(12, 2), nullable=True)             # 每股盈餘（trailing EPS）
    dividend_yield = Column(Numeric(6, 2), nullable=True)   # 殖利率（%）
    roe = Column(Numeric(6, 2), nullable=True)              # 股東權益報酬率（%）
    market_cap = Column(Numeric(20, 0), nullable=True)      # 市值（元）

    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now())

    def __repr__(self):
        return f"<StockFundamental(code='{self.stock_code}', pe={self.pe_ratio})>"
