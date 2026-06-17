"""notifications table

Revision ID: b8c0d2e4f6a8
Revises: a7b9c1d3e5f7
Create Date: 2026-06-16 14:00:00.000000

站內通知：AI 開倉/建議、TP/SL 成交、風控熔斷。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'b8c0d2e4f6a8'
down_revision: Union[str, None] = 'a7b9c1d3e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_user_read', 'notifications', ['user_id', 'read'])


def downgrade() -> None:
    op.drop_index('ix_notifications_user_read', table_name='notifications')
    op.drop_table('notifications')
