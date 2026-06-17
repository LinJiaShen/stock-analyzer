"""tdcc holder unique constraint

Revision ID: c9d1e3f5a7b9
Revises: b8c0d2e4f6a8
Create Date: 2026-06-16 15:00:00.000000

tdcc_holder_data 加 (stock_code, week_date) 唯一鍵，供每週 upsert。
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c9d1e3f5a7b9'
down_revision: Union[str, None] = 'b8c0d2e4f6a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint('uq_tdcc_code_week', 'tdcc_holder_data', ['stock_code', 'week_date'])


def downgrade() -> None:
    op.drop_constraint('uq_tdcc_code_week', 'tdcc_holder_data', type_='unique')
