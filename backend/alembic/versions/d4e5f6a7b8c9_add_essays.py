"""add essays table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'essays',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False, server_default=''),
        sa.Column('level', sa.String(length=10), nullable=False, server_default='B1'),
        sa.Column('target_word_count', sa.Integer(), nullable=True),
        sa.Column('target_words', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('quick_score', sa.Integer(), nullable=True),
        sa.Column('quick_feedback', sa.Text(), nullable=True),
        sa.Column('deep_score', sa.Integer(), nullable=True),
        sa.Column('deep_review', sa.Text(), nullable=True),
        sa.Column('time_spent_seconds', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('deleted', sa.Boolean(), server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_essays_person_id', 'essays', ['person_id'])


def downgrade() -> None:
    op.drop_index('ix_essays_person_id', table_name='essays')
    op.drop_table('essays')
