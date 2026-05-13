"""add books library tables (books, reading_sessions, book_highlights)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-05-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'books',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('author', sa.String(length=200), nullable=True),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('total_pages', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_page', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='reading'),
        sa.Column('cover_url', sa.String(length=500), nullable=True),
        sa.Column('isbn', sa.String(length=20), nullable=True),
        sa.Column('tags', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('last_opened_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('deleted', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['person_id'], ['person.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_books_id', 'books', ['id'])
    op.create_index('ix_books_person_id', 'books', ['person_id'])
    op.create_index('ix_books_status', 'books', ['status'])

    op.create_table(
        'reading_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('start_page', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('end_page', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('pages_read', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('minutes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['person_id'], ['person.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_reading_sessions_id', 'reading_sessions', ['id'])
    op.create_index('ix_reading_sessions_book_id', 'reading_sessions', ['book_id'])
    op.create_index('ix_reading_sessions_person_id', 'reading_sessions', ['person_id'])
    op.create_index('ix_reading_sessions_started_at', 'reading_sessions', ['started_at'])

    op.create_table(
        'book_highlights',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('page', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('kind', sa.String(length=20), nullable=False, server_default='highlight'),
        sa.Column('color', sa.String(length=20), nullable=True),
        sa.Column('dictionary_word_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['person_id'], ['person.id'], ),
        sa.ForeignKeyConstraint(['dictionary_word_id'], ['dictionary_words.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_book_highlights_id', 'book_highlights', ['id'])
    op.create_index('ix_book_highlights_book_id', 'book_highlights', ['book_id'])
    op.create_index('ix_book_highlights_person_id', 'book_highlights', ['person_id'])
    op.create_index('ix_book_highlights_dictionary_word_id', 'book_highlights', ['dictionary_word_id'])
    op.create_index('ix_book_highlights_created_at', 'book_highlights', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_book_highlights_created_at', table_name='book_highlights')
    op.drop_index('ix_book_highlights_dictionary_word_id', table_name='book_highlights')
    op.drop_index('ix_book_highlights_person_id', table_name='book_highlights')
    op.drop_index('ix_book_highlights_book_id', table_name='book_highlights')
    op.drop_index('ix_book_highlights_id', table_name='book_highlights')
    op.drop_table('book_highlights')

    op.drop_index('ix_reading_sessions_started_at', table_name='reading_sessions')
    op.drop_index('ix_reading_sessions_person_id', table_name='reading_sessions')
    op.drop_index('ix_reading_sessions_book_id', table_name='reading_sessions')
    op.drop_index('ix_reading_sessions_id', table_name='reading_sessions')
    op.drop_table('reading_sessions')

    op.drop_index('ix_books_status', table_name='books')
    op.drop_index('ix_books_person_id', table_name='books')
    op.drop_index('ix_books_id', table_name='books')
    op.drop_table('books')
