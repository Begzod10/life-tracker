"""add SRS columns to essay_errors for drill scheduling

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('essay_errors', sa.Column('review_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('essay_errors', sa.Column('correct_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('essay_errors', sa.Column('interval_days', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('essay_errors', sa.Column('last_reviewed_at', sa.DateTime(), nullable=True))
    op.add_column('essay_errors', sa.Column('next_review_at', sa.DateTime(), nullable=True))
    op.add_column('essay_errors', sa.Column('archived', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index('ix_essay_errors_next_review_at', 'essay_errors', ['next_review_at'])
    op.create_index('ix_essay_errors_archived', 'essay_errors', ['archived'])


def downgrade() -> None:
    op.drop_index('ix_essay_errors_archived', table_name='essay_errors')
    op.drop_index('ix_essay_errors_next_review_at', table_name='essay_errors')
    op.drop_column('essay_errors', 'archived')
    op.drop_column('essay_errors', 'next_review_at')
    op.drop_column('essay_errors', 'last_reviewed_at')
    op.drop_column('essay_errors', 'interval_days')
    op.drop_column('essay_errors', 'correct_count')
    op.drop_column('essay_errors', 'review_count')
