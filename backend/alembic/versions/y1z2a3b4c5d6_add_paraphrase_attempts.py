"""add paraphrase_attempts table

Revision ID: y1z2a3b4c5d6
Revises: x1y2z3a4b5c6
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'y1z2a3b4c5d6'
down_revision = 'x1y2z3a4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'paraphrase_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('technique', sa.String(length=50), nullable=False),
        sa.Column('sentence_id', sa.Integer(), nullable=True),
        sa.Column('original_sentence', sa.Text(), nullable=False),
        sa.Column('response', sa.Text(), nullable=False),
        sa.Column('applied_correctly', sa.Boolean(), nullable=True),
        sa.Column('technique_check', sa.Text(), nullable=True),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('model_answer', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['person_id'], ['person.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_paraphrase_attempts_id'), 'paraphrase_attempts', ['id'], unique=False)
    op.create_index(op.f('ix_paraphrase_attempts_person_id'), 'paraphrase_attempts', ['person_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_paraphrase_attempts_person_id'), table_name='paraphrase_attempts')
    op.drop_index(op.f('ix_paraphrase_attempts_id'), table_name='paraphrase_attempts')
    op.drop_table('paraphrase_attempts')
