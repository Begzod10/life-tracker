"""word review scheduling

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-07 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'dictionary_words',
        sa.Column('next_review_at', sa.DateTime(), nullable=True),
    )
    op.add_column(
        'dictionary_words',
        sa.Column('interval_days', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_dictionary_words_next_review_at', 'dictionary_words', ['next_review_at'])


def downgrade() -> None:
    op.drop_index('ix_dictionary_words_next_review_at', table_name='dictionary_words')
    op.drop_column('dictionary_words', 'interval_days')
    op.drop_column('dictionary_words', 'next_review_at')
