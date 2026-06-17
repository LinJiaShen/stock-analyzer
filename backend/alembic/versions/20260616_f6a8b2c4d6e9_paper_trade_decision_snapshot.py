"""paper trade decision snapshot

Revision ID: f6a8b2c4d6e9
Revises: e5f7a1b3c6d8
Create Date: 2026-06-16 12:00:00.000000

模擬單新增 decision_snapshot（AI 開倉時的評分快照），作為決策日誌。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'f6a8b2c4d6e9'
down_revision: Union[str, None] = 'e5f7a1b3c6d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('paper_trades', sa.Column('decision_snapshot', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('paper_trades', 'decision_snapshot')
