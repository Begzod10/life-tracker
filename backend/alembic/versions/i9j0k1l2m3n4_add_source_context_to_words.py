"""add source-context columns to dictionary_words and book_highlights

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-06-01

Adds structured source-context columns so a saved word can point back to the
book + page + the exact sentence it came from. This unlocks two things:

  - The Dictionary card can show "from <book>, p. <page>" with a deep-link
    back into the reader instead of relying on the unstructured
    tags="book:NN|page:NN" string.
  - The practice cloze mode can blank the target word inside its own
    original sentence (the strongest possible recall cue) instead of
    falling back to AI-generated examples.

Also adds source_sentence to book_highlights so the reader can store
the surrounding sentence captured at save time (a single-word selection
in the PDF doesn't otherwise contain a sentence).

Backfill: parse the existing "book:NN|page:NN" tag string on
DictionaryWord rows to populate source_book_id + source_page where we
can. source_sentence stays NULL until the row is re-saved with a
sentence; clozes simply fall back to AI examples until then.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, Sequence[str], None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'dictionary_words',
        sa.Column('source_book_id', sa.Integer(), nullable=True),
    )
    op.add_column(
        'dictionary_words',
        sa.Column('source_page', sa.Integer(), nullable=True),
    )
    op.add_column(
        'dictionary_words',
        sa.Column('source_sentence', sa.Text(), nullable=True),
    )
    op.create_index(
        'ix_dictionary_words_source_book_id',
        'dictionary_words',
        ['source_book_id'],
    )
    op.create_foreign_key(
        'fk_dictionary_words_source_book',
        'dictionary_words',
        'books',
        ['source_book_id'],
        ['id'],
        ondelete='SET NULL',
    )

    op.add_column(
        'book_highlights',
        sa.Column('source_sentence', sa.Text(), nullable=True),
    )

    # Backfill source_book_id + source_page from the legacy tag string
    # "book:NN|page:NN" that the reader has been writing into
    # DictionaryWord.tags. Uses the SET NULL FK so a deleted book
    # won't break the join.
    op.execute(
        r"""
        UPDATE dictionary_words
        SET    source_book_id = (
                   SUBSTRING(tags FROM 'book:([0-9]+)')
               )::int,
               source_page    = (
                   SUBSTRING(tags FROM 'page:([0-9]+)')
               )::int
        WHERE  tags ~ 'book:[0-9]+'
          AND  tags ~ 'page:[0-9]+'
          AND  source_book_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column('book_highlights', 'source_sentence')
    op.drop_constraint(
        'fk_dictionary_words_source_book',
        'dictionary_words',
        type_='foreignkey',
    )
    op.drop_index('ix_dictionary_words_source_book_id', table_name='dictionary_words')
    op.drop_column('dictionary_words', 'source_sentence')
    op.drop_column('dictionary_words', 'source_page')
    op.drop_column('dictionary_words', 'source_book_id')
