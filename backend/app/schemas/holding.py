"""
持股 Schema
"""
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class HoldingCreate(BaseModel):
    stock_code: str
    stock_name: str
    quantity: int = 0
    avg_cost: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None


class HoldingUpdate(BaseModel):
    quantity: Optional[int] = None
    avg_cost: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None


class HoldingResponse(BaseModel):
    id: UUID
    user_id: UUID
    stock_code: str
    stock_name: str
    quantity: int
    avg_cost: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
