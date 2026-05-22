"""track telegram delivery on daily_conclusions

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-05-22

Adds telegram_sent_at to daily_conclusions so we can detect rows where the
AI text was generated and committed but the Telegram message was never
delivered (e.g. the worker process was SIGTERMed mid-send by a deploy or
restart). A periodic task can then retry delivery for any row where text
exists and the timestamp is still NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, Sequence[str], None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'daily_conclusions',
        sa.Column('telegram_sent_at', sa.DateTime(), nullable=True),
    )

    # Assume any pre-existing row from a previous day already had its
    # Telegram message delivered — otherwise the retry task would spam
    # users with old conclusions on its first run. Today's rows stay
    # NULL so the retry task can repair today's broken delivery.
    op.execute(
        """
        UPDATE daily_conclusions
        SET    telegram_sent_at = created_at
        WHERE  date < (NOW() AT TIME ZONE 'Asia/Tashkent')::date
        """
    )


def downgrade() -> None:
    op.drop_column('daily_conclusions', 'telegram_sent_at')
