"""paper accounts table

Revision ID: b2c4d6e8f0a1
Revises: aa6c55d9a1d2
Create Date: 2026-06-12 10:00:00.000000

模擬交易帳戶：每位使用者一個帳戶，紀錄本金（initial_capital）與權益高點。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'b2c4d6e8f0a1'
down_revision: Union[str, None] = 'aa6c55d9a1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'paper_accounts',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=False),
        sa.Column('initial_capital', sa.Numeric(16, 0), nullable=False, server_default='1000000'),
        sa.Column('peak_equity', sa.Numeric(16, 0), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_paper_accounts_user_id'),
    )
    op.create_index('ix_paper_accounts_user_id', 'paper_accounts', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_paper_accounts_user_id', table_name='paper_accounts')
    op.drop_table('paper_accounts')
