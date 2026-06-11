"""swap news providers: gnews/newsapi → newsdata/hackernews

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade():
    # Rename gnews_topic → newsdata_category, drop newsapi_category.
    # Existing rows get newsdata_category = NULL so the seed script /
    # admin can fill in the correct NewsData category names.
    op.alter_column(
        'news_categories',
        'gnews_topic',
        new_column_name='newsdata_category',
        existing_type=sa.String(50),
        existing_nullable=True,
    )
    op.drop_column('news_categories', 'newsapi_category')

    # Update the provider tag on old news_items rows so the column comment
    # stays accurate (old data is still valid, just tagged differently).
    op.execute(
        "UPDATE news_items SET provider = 'newsdata' WHERE provider = 'gnews'"
    )
    op.execute(
        "UPDATE news_items SET provider = 'newsdata' WHERE provider = 'newsapi'"
    )


def downgrade():
    op.alter_column(
        'news_categories',
        'newsdata_category',
        new_column_name='gnews_topic',
        existing_type=sa.String(50),
        existing_nullable=True,
    )
    op.add_column(
        'news_categories',
        sa.Column('newsapi_category', sa.String(50), nullable=True),
    )
