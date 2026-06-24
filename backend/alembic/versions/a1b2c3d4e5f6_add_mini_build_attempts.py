"""add mini_build_attempts table

Revision ID: a1b2c3d4e5f6
Revises: z1a2b3c4d5e6
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'z1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'mini_build_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('question_type', sa.String(length=50), nullable=True),
        sa.Column('required_words', sa.JSON(), nullable=True),
        sa.Column('response', sa.Text(), nullable=False),
        sa.Column('paraphrase_score', sa.Integer(), nullable=True),
        sa.Column('vocab_score', sa.Integer(), nullable=True),
        sa.Column('position_score', sa.Integer(), nullable=True),
        sa.Column('total_score', sa.Integer(), nullable=True),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('model_answer', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['person_id'], ['person.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_mini_build_attempts_id'), 'mini_build_attempts', ['id'], unique=False)
    op.create_index(op.f('ix_mini_build_attempts_person_id'), 'mini_build_attempts', ['person_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_mini_build_attempts_person_id'), table_name='mini_build_attempts')
    op.drop_index(op.f('ix_mini_build_attempts_id'), table_name='mini_build_attempts')
    op.drop_table('mini_build_attempts')
