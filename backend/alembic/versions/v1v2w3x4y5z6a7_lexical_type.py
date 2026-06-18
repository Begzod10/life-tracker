"""add lexical_type to dictionary_words and backfill

Revision ID: v1v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'v1v2w3x4y5z6a7'
down_revision = 'u1v2w3x4y5z6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'dictionary_words',
        sa.Column('lexical_type', sa.String(20), nullable=False, server_default='word'),
    )

    # Backfill existing rows using the same heuristic as classify() in lexical_type.py.
    # Pure SQL — no Python imports needed in the migration environment.
    conn = op.get_bind()

    # 1. Linkers: match sentence-frame patterns
    conn.execute(text("""
        UPDATE dictionary_words
        SET lexical_type = 'linker'
        WHERE lexical_type = 'word'
          AND (
            word ~* '\\mthat$'
            OR word ~* '^this\\M'
            OR word ~* '^it is\\M'
            OR word ~* '^there (is|are)\\M'
            OR word ~* '^(while|although|whereas|however|moreover|furthermore)\\M'
            OR word ~* '\\mis (widely|generally|often) (believed|argued|claimed)\\M'
            OR word ~* '\\m(demonstrates|suggests|indicates|proves|shows) that\\M'
          )
    """))

    # 2. Multi-token words: collocation (2–3 tokens) or phrase (4+ tokens).
    #    Count tokens by splitting on whitespace (array_length(string_to_array(...))).
    conn.execute(text("""
        UPDATE dictionary_words
        SET lexical_type = 'collocation'
        WHERE lexical_type = 'word'
          AND array_length(string_to_array(trim(word), ' '), 1) BETWEEN 2 AND 3
    """))

    conn.execute(text("""
        UPDATE dictionary_words
        SET lexical_type = 'phrase'
        WHERE lexical_type = 'word'
          AND array_length(string_to_array(trim(word), ' '), 1) >= 4
    """))

    # Remaining rows with lexical_type = 'word' are single-token — correct as-is.


def downgrade():
    op.drop_column('dictionary_words', 'lexical_type')
