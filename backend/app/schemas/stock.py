"""
股票與產業鏈 Schema
"""
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel


class StockResponse(BaseModel):
    code: str
    name: str
    industry_code: Optional[str] = None
    industry_name: Optional[str] = None
    market_cap: Optional[Decimal] = None
    listed_date: Optional[date] = None
    
    class Config:
        from_attributes = True


class IndustryChainResponse(BaseModel):
    id: int
    parent_industry: str
    sub_industry: str
    stock_code: str
    relation_type: str
    weight: Decimal
    
    class Config:
        from_attributes = True


class StockWithIndustryResponse(StockResponse):
    industry_chains: List[IndustryChainResponse] = []
