"""
持股模型
"""
from sqlalchemy import Column, String, Integer, Numeric, Date, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func as sql_func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class Holding(Base):
    __tablename__ = "holdings"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    stock_code = Column(String(10), nullable=False)
    stock_name = Column(String(100), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    avg_cost = Column(Numeric(12, 2))
    purchase_date = Column(Date)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=sql_func.now())
    updated_at = Column(DateTime(timezone=True), server_default=sql_func.now(), onupdate=sql_func.now())
    
    # 關聯
    user = relationship("User", backref="holdings")
    diagnostics = relationship("HoldingDiagnostic", back_populates="holding", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint("user_id", "stock_code", name="uq_user_stock"),
    )
    
    def __repr__(self):
        return f"<Holding(user_id='{self.user_id}', stock='{self.stock_code} {self.stock_name}')>"
