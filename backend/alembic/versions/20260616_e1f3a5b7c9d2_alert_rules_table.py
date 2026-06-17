"""alert rules table

Revision ID: e1f3a5b7c9d2
Revises: d0e2f4a6b8c0
Create Date: 2026-06-16 17:00:00.000000

自訂預警規則：條件式預警（突破/爆量/外資連買/跌破均線），盤後掃描寫 notifications。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = 'e1f3a5b7c9d2'
down_revision: Union[str, None] = 'd0e2f4a6b8c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'alert_rules',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('stock_code', sa.String(10), nullable=False),
        sa.Column('stock_name', sa.String(100), nullable=True),
        sa.Column('rule_type', sa.String(30), nullable=False),
        sa.Column('params', JSONB, nullable=False, server_default='{}'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_alert_rules_user_enabled', 'alert_rules', ['user_id', 'enabled'])


def downgrade() -> None:
    op.drop_index('ix_alert_rules_user_enabled', table_name='alert_rules')
    op.drop_table('alert_rules')
