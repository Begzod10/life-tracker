"""add user_grammar_points table for grammar SRS

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'u1v2w3x4y5z6'
down_revision = 't0u1v2w3x4y5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_grammar_points',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('person_id', sa.Integer(),
                  sa.ForeignKey('person.id', ondelete='CASCADE'), nullable=False),
        sa.Column('grammar_point_id', sa.String(64), nullable=False),
        sa.Column('reps', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ease', sa.Float(), nullable=False, server_default='2.5'),
        sa.Column('interval_days', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('lapses', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('correct_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('review_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_seen_at', sa.DateTime(), nullable=True),
        sa.Column('next_review_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('person_id', 'grammar_point_id', name='uq_user_grammar_point'),
    )
    op.create_index('ix_user_grammar_points_person_id', 'user_grammar_points', ['person_id'])
    op.create_index('ix_user_grammar_points_next_review', 'user_grammar_points', ['next_review_at'])


def downgrade():
    op.drop_index('ix_user_grammar_points_next_review', table_name='user_grammar_points')
    op.drop_index('ix_user_grammar_points_person_id', table_name='user_grammar_points')
    op.drop_table('user_grammar_points')
