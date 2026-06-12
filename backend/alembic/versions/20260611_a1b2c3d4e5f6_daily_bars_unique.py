"""daily_bars unique constraint on (stock_code, trade_date)

先刪除重複列（保留 id 最大者，即最後寫入），再加上 unique constraint。

Revision ID: a1b2c3d4e5f6
Revises: 8eb232c46b67
Create Date: 2026-06-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "8eb232c46b67"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 去除重複 (stock_code, trade_date)，保留最後寫入的一筆
    op.execute(
        """
        DELETE FROM daily_bars a
        USING daily_bars b
        WHERE a.stock_code = b.stock_code
          AND a.trade_date = b.trade_date
          AND a.id < b.id
        """
    )
    op.create_unique_constraint(
        "uq_daily_bars_code_date", "daily_bars", ["stock_code", "trade_date"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_daily_bars_code_date", "daily_bars", type_="unique")
