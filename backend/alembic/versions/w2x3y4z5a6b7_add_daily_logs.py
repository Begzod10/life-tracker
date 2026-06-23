"""add daily_logs table

Revision ID: w2x3y4z5a6b7
Revises: v1v2w3x4y5z6a7
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

revision = 'w2x3y4z5a6b7'
down_revision = 'v1v2w3x4y5z6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'daily_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('mood', sa.Integer(), nullable=True),
        sa.Column('energy', sa.Integer(), nullable=True),
        sa.Column('journal', sa.Text(), nullable=True),
        sa.Column('wins', sa.Text(), nullable=True),
        sa.Column('challenges', sa.Text(), nullable=True),
        sa.Column('improvements', sa.Text(), nullable=True),
        sa.Column('intention_1', sa.String(300), nullable=True),
        sa.Column('intention_2', sa.String(300), nullable=True),
        sa.Column('intention_3', sa.String(300), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_daily_logs_person_id', 'daily_logs', ['person_id'])
    op.create_index('ix_daily_logs_date', 'daily_logs', ['date'])
    op.create_unique_constraint('uq_daily_log_person_date', 'daily_logs', ['person_id', 'date'])


def downgrade():
    op.drop_table('daily_logs')
