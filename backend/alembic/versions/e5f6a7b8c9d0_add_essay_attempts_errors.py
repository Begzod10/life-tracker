"""add essay_attempts and essay_errors tables

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'essay_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('essay_id', sa.Integer(), sa.ForeignKey('essays.id', ondelete='CASCADE'), nullable=False),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.Column('level_estimate', sa.String(length=10), nullable=True),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('payload', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_essay_attempts_essay_id', 'essay_attempts', ['essay_id'])
    op.create_index('ix_essay_attempts_person_id', 'essay_attempts', ['person_id'])
    op.create_index('ix_essay_attempts_created_at', 'essay_attempts', ['created_at'])

    op.create_table(
        'essay_errors',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('attempt_id', sa.Integer(), sa.ForeignKey('essay_attempts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('essay_id', sa.Integer(), sa.ForeignKey('essays.id', ondelete='CASCADE'), nullable=False),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('original', sa.Text(), nullable=True),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('suggestion', sa.Text(), nullable=True),
        sa.Column('level', sa.String(length=10), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_essay_errors_attempt_id', 'essay_errors', ['attempt_id'])
    op.create_index('ix_essay_errors_essay_id', 'essay_errors', ['essay_id'])
    op.create_index('ix_essay_errors_person_id', 'essay_errors', ['person_id'])
    op.create_index('ix_essay_errors_kind', 'essay_errors', ['kind'])
    op.create_index('ix_essay_errors_created_at', 'essay_errors', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_essay_errors_created_at', table_name='essay_errors')
    op.drop_index('ix_essay_errors_kind', table_name='essay_errors')
    op.drop_index('ix_essay_errors_person_id', table_name='essay_errors')
    op.drop_index('ix_essay_errors_essay_id', table_name='essay_errors')
    op.drop_index('ix_essay_errors_attempt_id', table_name='essay_errors')
    op.drop_table('essay_errors')

    op.drop_index('ix_essay_attempts_created_at', table_name='essay_attempts')
    op.drop_index('ix_essay_attempts_person_id', table_name='essay_attempts')
    op.drop_index('ix_essay_attempts_essay_id', table_name='essay_attempts')
    op.drop_table('essay_attempts')
