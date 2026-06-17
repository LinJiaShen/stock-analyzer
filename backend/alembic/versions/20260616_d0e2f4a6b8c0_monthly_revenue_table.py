"""monthly revenue table

Revision ID: d0e2f4a6b8c0
Revises: c9d1e3f5a7b9
Create Date: 2026-06-16 16:00:00.000000

月營收（YoY/MoM/累計），來源 TWSE/TPEx MOPS。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd0e2f4a6b8c0'
down_revision: Union[str, None] = 'c9d1e3f5a7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'stock_monthly_revenue',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('stock_code', sa.String(10), nullable=False),
        sa.Column('revenue_month', sa.Date(), nullable=False),
        sa.Column('revenue', sa.Numeric(18, 0), nullable=True),
        sa.Column('mom_pct', sa.Numeric(10, 2), nullable=True),
        sa.Column('yoy_pct', sa.Numeric(10, 2), nullable=True),
        sa.Column('cum_revenue', sa.Numeric(18, 0), nullable=True),
        sa.Column('cum_yoy_pct', sa.Numeric(10, 2), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['stock_code'], ['stocks.code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('stock_code', 'revenue_month', name='uq_revenue_code_month'),
    )
    op.create_index('ix_stock_monthly_revenue_stock_code', 'stock_monthly_revenue', ['stock_code'])


def downgrade() -> None:
    op.drop_index('ix_stock_monthly_revenue_stock_code', table_name='stock_monthly_revenue')
    op.drop_table('stock_monthly_revenue')
