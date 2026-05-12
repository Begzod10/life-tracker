"""add essay_plans table

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'essay_plans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'essay_id',
            sa.Integer(),
            sa.ForeignKey('essays.id', ondelete='CASCADE'),
            nullable=False,
            unique=True,
        ),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('thesis', sa.Text(), nullable=True),
        sa.Column('body_plans', sa.Text(), nullable=True),
        sa.Column('conclusion_plan', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_essay_plans_essay_id', 'essay_plans', ['essay_id'])
    op.create_index('ix_essay_plans_person_id', 'essay_plans', ['person_id'])


def downgrade() -> None:
    op.drop_index('ix_essay_plans_person_id', table_name='essay_plans')
    op.drop_index('ix_essay_plans_essay_id', table_name='essay_plans')
    op.drop_table('essay_plans')
