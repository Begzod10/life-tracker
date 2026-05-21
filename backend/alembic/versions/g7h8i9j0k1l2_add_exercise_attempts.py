"""add exercise_attempts table

Revision ID: g7h8i9j0k1l2
Revises: e1f2a3b4c5d6
Create Date: 2026-05-21

Persists one row per sentence a learner writes during an Exercises session,
along with the AI's grade and feedback. Sessions themselves reuse the existing
practice_sessions table with mode='exercise' so streaks and history keep
working across all practice modes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'exercise_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column(
            'session_id',
            sa.Integer(),
            sa.ForeignKey('practice_sessions.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'word_id',
            sa.Integer(),
            sa.ForeignKey('dictionary_words.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('sentence', sa.Text(), nullable=False),
        sa.Column('is_correct', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('usage_score', sa.Integer(), nullable=True),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('suggested_revision', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_exercise_attempts_person_id', 'exercise_attempts', ['person_id'])
    op.create_index('ix_exercise_attempts_word_id', 'exercise_attempts', ['word_id'])
    op.create_index('ix_exercise_attempts_session_id', 'exercise_attempts', ['session_id'])
    op.create_index('ix_exercise_attempts_created_at', 'exercise_attempts', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_exercise_attempts_created_at', table_name='exercise_attempts')
    op.drop_index('ix_exercise_attempts_session_id', table_name='exercise_attempts')
    op.drop_index('ix_exercise_attempts_word_id', table_name='exercise_attempts')
    op.drop_index('ix_exercise_attempts_person_id', table_name='exercise_attempts')
    op.drop_table('exercise_attempts')
