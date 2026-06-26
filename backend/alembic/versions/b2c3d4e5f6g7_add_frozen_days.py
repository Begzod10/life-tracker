"""add frozen_days table

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-26

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'frozen_days',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('person_id', 'date', name='uq_frozen_day_person_date'),
    )
    op.create_index('ix_frozen_days_id', 'frozen_days', ['id'])
    op.create_index('ix_frozen_days_date', 'frozen_days', ['date'])


def downgrade():
    op.drop_index('ix_frozen_days_date', table_name='frozen_days')
    op.drop_index('ix_frozen_days_id', table_name='frozen_days')
    op.drop_table('frozen_days')
