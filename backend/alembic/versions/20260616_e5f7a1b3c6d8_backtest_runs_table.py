"""backtest runs table

Revision ID: e5f7a1b3c6d8
Revises: d4e6f8a0b2c5
Create Date: 2026-06-16 11:00:00.000000

回測結果：參數 / 績效指標 / 權益曲線。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = 'e5f7a1b3c6d8'
down_revision: Union[str, None] = 'd4e6f8a0b2c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'backtest_runs',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('label', sa.String(100), nullable=True),
        sa.Column('params', JSONB, nullable=False),
        sa.Column('metrics', JSONB, nullable=False),
        sa.Column('equity_curve', JSONB, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_backtest_runs_user_id', 'backtest_runs', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_backtest_runs_user_id', table_name='backtest_runs')
    op.drop_table('backtest_runs')
