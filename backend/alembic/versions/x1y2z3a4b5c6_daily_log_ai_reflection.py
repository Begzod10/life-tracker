"""add ai_reflection to daily_logs

Revision ID: x1y2z3a4b5c6
Revises: w2x3y4z5a6b7
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

revision = 'x1y2z3a4b5c6'
down_revision = 'w2x3y4z5a6b7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('daily_logs', sa.Column('ai_reflection', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('daily_logs', 'ai_reflection')
