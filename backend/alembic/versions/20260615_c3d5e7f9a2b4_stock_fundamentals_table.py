"""stock fundamentals table

Revision ID: c3d5e7f9a2b4
Revises: b2c4d6e8f0a1
Create Date: 2026-06-15 10:00:00.000000

個股基本面快照：本益比/本淨比/EPS/殖利率/ROE/市值，來源 yfinance。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d5e7f9a2b4'
down_revision: Union[str, None] = 'b2c4d6e8f0a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'stock_fundamentals',
        sa.Column('stock_code', sa.String(10), nullable=False),
        sa.Column('pe_ratio', sa.Numeric(12, 2), nullable=True),
        sa.Column('forward_pe', sa.Numeric(12, 2), nullable=True),
        sa.Column('pb_ratio', sa.Numeric(12, 2), nullable=True),
        sa.Column('eps', sa.Numeric(12, 2), nullable=True),
        sa.Column('dividend_yield', sa.Numeric(6, 2), nullable=True),
        sa.Column('roe', sa.Numeric(6, 2), nullable=True),
        sa.Column('market_cap', sa.Numeric(20, 0), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['stock_code'], ['stocks.code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('stock_code'),
    )


def downgrade() -> None:
    op.drop_table('stock_fundamentals')
