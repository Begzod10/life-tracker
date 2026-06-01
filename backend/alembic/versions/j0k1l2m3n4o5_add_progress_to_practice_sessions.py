"""add progress snapshot to practice_sessions

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-06-01

Adds a JSONB `progress` column so an in-progress drill can be resumed
later. The frontend writes a chunk-boundary snapshot — original pool
IDs, unseen queue, mistakes pool, aggregate counts, mode + scope — and
clears it implicitly when the session completes (completed_at is set
by the existing PUT /session/{id}/complete handler).

JSONB so we can extend the shape without further migrations and so the
DB indexes it sensibly. NULL means "no snapshot yet" — a freshly
created session before its first chunk completes, or any pre-feature
row.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, Sequence[str], None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'practice_sessions',
        sa.Column('progress', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('practice_sessions', 'progress')
