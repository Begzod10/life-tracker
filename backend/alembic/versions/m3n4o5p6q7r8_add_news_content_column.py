"""add news_items.content column for full article text

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-06-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'm3n4o5p6q7r8'
down_revision: Union[str, Sequence[str], None] = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('news_items', sa.Column('content', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('news_items', 'content')
