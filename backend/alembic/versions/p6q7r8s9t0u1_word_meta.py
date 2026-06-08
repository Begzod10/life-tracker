"""word_meta column on dictionary_words for Phase B exercise types

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('dictionary_words',
        sa.Column('word_meta', sa.JSON, nullable=True))


def downgrade():
    op.drop_column('dictionary_words', 'word_meta')
