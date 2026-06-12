"""
K 線數據模型 (TimescaleDB Hypertable)
"""
from datetime import date

from sqlalchemy import Column, Integer, Numeric, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class DailyBar(Base):
    """
    日 K 線數據表
    使用 TimescaleDB hypertable 按 trade_date 分區
    """
    __tablename__ = "daily_bars"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_code = Column(String(10), ForeignKey("stocks.code"), nullable=False, index=True)
    trade_date = Column(Date, nullable=False, index=True)
    open_price = Column(Numeric(12, 2))
    high_price = Column(Numeric(12, 2))
    low_price = Column(Numeric(12, 2))
    close_price = Column(Numeric(12, 2))
    adjusted_close = Column(Numeric(12, 2))  # 還原權值收盤價
    volume = Column(Numeric(18, 0))
    amount = Column(Numeric(18, 2))
    turn_rate = Column(Numeric(5, 4))  # 換手率

    # 關聯
    stock = relationship("Stock", backref="daily_bars")

    __table_args__ = (
        UniqueConstraint("stock_code", "trade_date", name="uq_daily_bars_code_date"),
    )

    def __repr__(self):
        return f"<DailyBar(stock='{self.stock_code}', date='{self.trade_date}', close={self.close_price})>"


class MinuteBar(Base):
    """
    分 K 線數據表 (用於盤中即時分析)
    使用 TimescaleDB hypertable 按 created_at 分區
    """
    __tablename__ = "minute_bars"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_code = Column(String(10), ForeignKey("stocks.code"), nullable=False, index=True)
    bar_time = Column(Date, nullable=False, index=True)  # Actually DateTime for minute bars
    interval_minutes = Column(Integer, nullable=False, default=1)  # 1, 3, 5, 15, 30
    open_price = Column(Numeric(12, 2))
    high_price = Column(Numeric(12, 2))
    low_price = Column(Numeric(12, 2))
    close_price = Column(Numeric(12, 2))
    volume = Column(Numeric(18, 0))
    amount = Column(Numeric(18, 2))

    # 關聯
    stock = relationship("Stock", backref="minute_bars")

    def __repr__(self):
        return f"<MinuteBar(stock='{self.stock_code}', time='{self.bar_time}', interval={self.interval_minutes}min)>"


class ChipData(Base):
    """
    籌碼數據表 (自營商/外資/投信買賣超)
    """
    __tablename__ = "chip_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_code = Column(String(10), ForeignKey("stocks.code"), nullable=False, index=True)
    trade_date = Column(Date, nullable=False, index=True)

    # 自營商
    proprietary_buy = Column(Numeric(15, 2))
    proprietary_sell = Column(Numeric(15, 2))
    proprietary_net = Column(Numeric(15, 2))

    # 外資
    foreign_buy = Column(Numeric(15, 2))
    foreign_sell = Column(Numeric(15, 2))
    foreign_net = Column(Numeric(15, 2))

    # 投信
    trust_buy = Column(Numeric(15, 2))
    trust_sell = Column(Numeric(15, 2))
    trust_net = Column(Numeric(15, 2))

    # 權值股張數
    gw_volume = Column(Numeric(15, 0))

    # 融資餘額
    margin_balance = Column(Numeric(15, 2))
    margin_buy = Column(Numeric(15, 2))
    margin_sell = Column(Numeric(15, 2))
    margin_net = Column(Numeric(15, 2))

    # 關聯
    stock = relationship("Stock", backref="chip_data")

    def __repr__(self):
        return f"<ChipData(stock='{self.stock_code}', date='{self.trade_date}')>"


class TDCCHolderData(Base):
    """
    集保大戶資料 (400/1000/5000 張以上)
    每週更新
    """
    __tablename__ = "tdcc_holder_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_code = Column(String(10), ForeignKey("stocks.code"), nullable=False, index=True)
    week_date = Column(Date, nullable=False, index=True)  # 該週週五日期

    # 400 張以上
    holder_400_count = Column(Integer, default=0)
    holder_400_shares = Column(Numeric(15, 0), default=0)
    holder_400_ratio = Column(Numeric(5, 4))  # 佔流通量比例

    # 1000 張以上
    holder_1000_count = Column(Integer, default=0)
    holder_1000_shares = Column(Numeric(15, 0), default=0)
    holder_1000_ratio = Column(Numeric(5, 4))

    # 5000 張以上
    holder_5000_count = Column(Integer, default=0)
    holder_5000_shares = Column(Numeric(15, 0), default=0)
    holder_5000_ratio = Column(Numeric(5, 4))

    # 流通量
    float_shares = Column(Numeric(15, 0))

    # 關聯
    stock = relationship("Stock", backref="tdcc_holder_data")

    def __repr__(self):
        return f"<TDCCHolderData(stock='{self.stock_code}', week='{self.week_date}')>"
