"""add notified_at column to time_blocks (idempotent — safe if already present)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-05-14

The TimeBlock model has had a `notified_at` column for a while but no
migration ever wired it up. On environments where someone added it
manually via ALTER TABLE this migration is a no-op; on environments
where it was never added it creates the column.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    if not _column_exists("time_blocks", "notified_at"):
        op.add_column(
            "time_blocks",
            sa.Column("notified_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    if _column_exists("time_blocks", "notified_at"):
        op.drop_column("time_blocks", "notified_at")
