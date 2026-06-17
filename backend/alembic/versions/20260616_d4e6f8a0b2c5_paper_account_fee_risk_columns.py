"""paper account fee and risk columns

Revision ID: d4e6f8a0b2c5
Revises: c3d5e7f9a2b4
Create Date: 2026-06-16 10:00:00.000000

模擬帳戶新增交易成本與風控參數：券商折數、自動交易模式、每筆風險%、
單一持股/總曝險上限、每日虧損熔斷、連敗暫停門檻、最多持倉數。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e6f8a0b2c5'
down_revision: Union[str, None] = 'c3d5e7f9a2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLUMNS = [
    ('fee_discount', sa.Numeric(4, 3), '1.0'),
    ('auto_trade_mode', sa.String(10), 'off'),
    ('risk_per_trade_pct', sa.Numeric(5, 2), '2.0'),
    ('max_position_pct', sa.Numeric(5, 2), '20.0'),
    ('max_total_exposure_pct', sa.Numeric(5, 2), '100.0'),
    ('daily_loss_limit_pct', sa.Numeric(5, 2), '3.0'),
    ('max_consecutive_losses', sa.Integer(), '5'),
    ('max_positions', sa.Integer(), '5'),
]


def upgrade() -> None:
    for name, col_type, default in _COLUMNS:
        op.add_column(
            'paper_accounts',
            sa.Column(name, col_type, nullable=False, server_default=default),
        )


def downgrade() -> None:
    for name, _, _ in reversed(_COLUMNS):
        op.drop_column('paper_accounts', name)
