"""add Task 2 essay session and attempt tables

Revision ID: t0u1v2w3x4y5
Revises: r8s9t0u1v2w3
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa

revision = 't0u1v2w3x4y5'
down_revision = 'r8s9t0u1v2w3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'essay_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('mode', sa.String(20), nullable=False, server_default='essay'),
        sa.Column('essay_type', sa.String(30), nullable=False),
        sa.Column('target_band', sa.Float(), nullable=False, server_default='7.0'),
        sa.Column('question_payload', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('started_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_essay_sessions_person_id', 'essay_sessions', ['person_id'])

    op.create_table(
        'task2_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('session_id', sa.Integer(),
                  sa.ForeignKey('essay_sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('essay_type', sa.String(30), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('question_type', sa.String(30), nullable=False),
        sa.Column('assigned_position', sa.Text(), nullable=True),
        sa.Column('target_band', sa.Float(), nullable=False, server_default='7.0'),
        sa.Column('response', sa.Text(), nullable=False),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('time_seconds', sa.Integer(), nullable=True),
        sa.Column('criteria_scores', sa.JSON(), nullable=True),
        sa.Column('overall_band', sa.Float(), nullable=True),
        sa.Column('is_correct', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('essay_errors', sa.JSON(), nullable=True),
        sa.Column('essay_focus_snapshot', sa.JSON(), nullable=True),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('model_revision', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_task2_attempts_person_id', 'task2_attempts', ['person_id'])
    op.create_index('ix_task2_attempts_session_id', 'task2_attempts', ['session_id'])
    op.create_index('ix_task2_attempts_created_at', 'task2_attempts', ['created_at'])


def downgrade():
    op.drop_index('ix_task2_attempts_created_at', table_name='task2_attempts')
    op.drop_index('ix_task2_attempts_session_id', table_name='task2_attempts')
    op.drop_index('ix_task2_attempts_person_id', table_name='task2_attempts')
    op.drop_table('task2_attempts')
    op.drop_index('ix_essay_sessions_person_id', table_name='essay_sessions')
    op.drop_table('essay_sessions')
