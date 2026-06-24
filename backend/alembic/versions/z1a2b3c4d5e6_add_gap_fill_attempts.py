"""add gap_fill_attempts table

Revision ID: z1a2b3c4d5e6
Revises: y1z2a3b4c5d6
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'z1a2b3c4d5e6'
down_revision = 'y1z2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'gap_fill_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), nullable=False),
        sa.Column('word_id', sa.Integer(), nullable=True),
        sa.Column('word', sa.String(length=200), nullable=False),
        sa.Column('gap_type', sa.String(length=30), nullable=False),
        sa.Column('sentence', sa.Text(), nullable=False),
        sa.Column('word_form_answer', sa.String(length=100), nullable=True),
        sa.Column('word_form_distractor', sa.String(length=100), nullable=True),
        sa.Column('word_form_response', sa.String(length=100), nullable=True),
        sa.Column('word_form_correct', sa.Boolean(), nullable=True),
        sa.Column('preposition_answer', sa.String(length=50), nullable=True),
        sa.Column('preposition_response', sa.String(length=50), nullable=True),
        sa.Column('preposition_correct', sa.Boolean(), nullable=True),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['person_id'], ['person.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['word_id'], ['dictionary_words.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_gap_fill_attempts_id'), 'gap_fill_attempts', ['id'], unique=False)
    op.create_index(op.f('ix_gap_fill_attempts_person_id'), 'gap_fill_attempts', ['person_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_gap_fill_attempts_person_id'), table_name='gap_fill_attempts')
    op.drop_index(op.f('ix_gap_fill_attempts_id'), table_name='gap_fill_attempts')
    op.drop_table('gap_fill_attempts')
