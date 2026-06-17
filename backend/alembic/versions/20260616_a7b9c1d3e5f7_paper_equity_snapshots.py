"""paper equity snapshots table

Revision ID: a7b9c1d3e5f7
Revises: f6a8b2c4d6e9
Create Date: 2026-06-16 13:00:00.000000

每日權益快照：計算真正的日報酬夏普 / Sortino / 歷史最大回撤。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'a7b9c1d3e5f7'
down_revision: Union[str, None] = 'f6a8b2c4d6e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'paper_equity_snapshots',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('equity', sa.Numeric(16, 0), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'snapshot_date', name='uq_equity_snap_user_date'),
    )
    op.create_index('ix_paper_equity_snapshots_user_id', 'paper_equity_snapshots', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_paper_equity_snapshots_user_id', table_name='paper_equity_snapshots')
    op.drop_table('paper_equity_snapshots')
