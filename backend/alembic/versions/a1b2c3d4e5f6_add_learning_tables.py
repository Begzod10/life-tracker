"""add_learning_tables

Revision ID: a1b2c3d4e5f6
Revises: 9b7a4a2b1c16
Create Date: 2026-04-26 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9b7a4a2b1c16'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'dictionary_words',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('word', sa.String(200), nullable=False, index=True),
        sa.Column('definition', sa.Text(), nullable=False),
        sa.Column('translation', sa.Text(), nullable=True),
        sa.Column('part_of_speech', sa.String(50), nullable=True),
        sa.Column('examples', sa.Text(), nullable=True),
        sa.Column('phonetic', sa.String(200), nullable=True),
        sa.Column('difficulty', sa.String(10), nullable=True, server_default='B1'),
        sa.Column('tags', sa.String(500), nullable=True),
        sa.Column('review_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('correct_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('last_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('deleted', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'practice_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('mode', sa.String(20), nullable=False),
        sa.Column('total_questions', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('correct_answers', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('practice_sessions')
    op.drop_table('dictionary_words')
