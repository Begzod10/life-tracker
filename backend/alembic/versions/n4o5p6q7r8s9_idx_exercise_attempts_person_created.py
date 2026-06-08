"""add composite index exercise_attempts(person_id, created_at)

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-06-08

Keeps GET /exercises/stats off a full table scan.
The stats query filters by person_id and created_at >= week_ago, so a
composite index on (person_id, created_at) lets the planner do a range scan
on the already-narrow person slice.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'n4o5p6q7r8s9'
down_revision: Union[str, Sequence[str], None] = 'm3n4o5p6q7r8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_exercise_attempts_person_created',
        'exercise_attempts',
        ['person_id', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_exercise_attempts_person_created', table_name='exercise_attempts')
