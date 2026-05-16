"""add resume_text + resume_page to books (idempotent — safe if already present)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-05-16

Stores a per-book "resume here" pointer so the reader can jump back to the
exact sentence the user marked when they last closed the book.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    if not _column_exists("books", "resume_text"):
        op.add_column("books", sa.Column("resume_text", sa.Text(), nullable=True))
    if not _column_exists("books", "resume_page"):
        op.add_column("books", sa.Column("resume_page", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _column_exists("books", "resume_page"):
        op.drop_column("books", "resume_page")
    if _column_exists("books", "resume_text"):
        op.drop_column("books", "resume_text")
