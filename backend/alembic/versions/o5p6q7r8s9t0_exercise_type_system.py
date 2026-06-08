"""exercise type system - add exercise_type, response, question_payload to exercise_attempts; items_plan to practice_sessions

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'o5p6q7r8s9t0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade():
    # exercise_attempts: add new columns
    op.add_column('exercise_attempts',
        sa.Column('exercise_type', sa.String(50), nullable=True))
    op.add_column('exercise_attempts',
        sa.Column('response', sa.Text, nullable=True))
    op.add_column('exercise_attempts',
        sa.Column('question_payload', sa.JSON, nullable=True))

    # Backfill existing rows
    op.execute("UPDATE exercise_attempts SET exercise_type = 'sentence' WHERE exercise_type IS NULL")
    op.execute("UPDATE exercise_attempts SET response = sentence WHERE response IS NULL")

    # Now make the new required columns NOT NULL and make sentence nullable
    op.alter_column('exercise_attempts', 'exercise_type',
        existing_type=sa.String(50),
        nullable=False,
        server_default='sentence')
    op.alter_column('exercise_attempts', 'response',
        existing_type=sa.Text,
        nullable=False,
        server_default='')
    op.alter_column('exercise_attempts', 'sentence',
        existing_type=sa.Text,
        nullable=True)

    # practice_sessions: add items_plan
    op.add_column('practice_sessions',
        sa.Column('items_plan', sa.JSON, nullable=True))


def downgrade():
    op.drop_column('practice_sessions', 'items_plan')
    op.alter_column('exercise_attempts', 'sentence',
        existing_type=sa.Text,
        nullable=False)
    op.drop_column('exercise_attempts', 'question_payload')
    op.drop_column('exercise_attempts', 'response')
    op.drop_column('exercise_attempts', 'exercise_type')
