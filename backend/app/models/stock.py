"""
股票基本資料與產業鏈關聯模型
"""
from sqlalchemy import Column, String, Integer, Numeric, Date, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship
from app.database import Base


class Stock(Base):
    __tablename__ = "stocks"
    
    code = Column(String(10), primary_key=True)
    name = Column(String(100), nullable=False)
    market = Column(String(10), default="unknown")  # twse / tpex / unknown
    stock_type = Column(String(10), default="stock")  # stock / etf
    industry_code = Column(String(10))
    industry_name = Column(String(100))
    market_cap = Column(Numeric(15, 2))
    listed_date = Column(Date)
    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now())
    
    # 關聯
    industry_chains = relationship("IndustryChain", back_populates="stock")
    
    def __repr__(self):
        return f"<Stock(code='{self.code}', name='{self.name}')>"


class IndustryChain(Base):
    """產業鏈關聯表 - 獨立關聯表設計，支援複雜的上下游產業鏈查詢"""
    __tablename__ = "industry_chains"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_industry = Column(String(100), nullable=False, index=True)
    sub_industry = Column(String(100), nullable=False)
    stock_code = Column(String(10), ForeignKey("stocks.code"), nullable=False)
    relation_type = Column(String(20), nullable=False, index=True)  # upstream / downstream / peer
    weight = Column(Numeric(5, 4), default=1.0)  # 關聯權重
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    
    # 關聯
    stock = relationship("Stock", back_populates="industry_chains")
    
    __table_args__ = (
        # 複合索引
    )
    
    def __repr__(self):
        return f"<IndustryChain(parent='{self.parent_industry}', stock='{self.stock_code}', type='{self.relation_type}')>"
