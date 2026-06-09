"""add grammar_errors to exercise_attempts

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'q7r8s9t0u1v2'
down_revision = 'p6q7r8s9t0u1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('exercise_attempts',
        sa.Column('grammar_errors', sa.JSON, nullable=True))


def downgrade():
    op.drop_column('exercise_attempts', 'grammar_errors')
