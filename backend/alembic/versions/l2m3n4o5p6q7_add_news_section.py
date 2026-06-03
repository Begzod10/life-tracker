"""add news section: categories, items, user subscriptions

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-06-03

Three new tables:

  - news_categories: catalog of subscribable categories. `mode='native'`
    rows map to a built-in topic on each provider via gnews_topic /
    newsapi_category. `mode='search'` rows pass `search_query` to the
    provider's search endpoint instead (used for Tier-2 categories that
    aren't a native bucket on either provider — e.g. Automotive).

  - news_items: per-article rows, deduped by (category_id, date, url).
    `date` is the Tashkent-local fetch date (the cron runs at 04:00 UTC =
    09:00 Tashkent), not the article's published_at — so the log calendar
    is always aligned with the user's day, not UTC.

  - user_news_categories: composite-PK subscription join table.

Seeds 8 native categories (the GNews ∩ NewsAPI overlap plus GNews-only
`world` and `nation`) plus one search-based Automotive category so the
section ships with usable defaults on first deploy.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'l2m3n4o5p6q7'
down_revision: Union[str, Sequence[str], None] = 'k1l2m3n4o5p6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── news_categories ────────────────────────────────────────────────────
    op.create_table(
        'news_categories',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('slug', sa.String(50), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('color', sa.String(20), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('mode', sa.String(10), nullable=False, server_default='native'),
        sa.Column('gnews_topic', sa.String(50), nullable=True),
        sa.Column('newsapi_category', sa.String(50), nullable=True),
        sa.Column('search_query', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_news_categories_slug', 'news_categories', ['slug'], unique=True)

    # ── news_items ─────────────────────────────────────────────────────────
    op.create_table(
        'news_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'category_id',
            sa.Integer(),
            sa.ForeignKey('news_categories.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('headline', sa.String(500), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('url', sa.String(2000), nullable=False),
        sa.Column('image_url', sa.String(2000), nullable=True),
        sa.Column('source_name', sa.String(200), nullable=True),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('fetched_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_news_items_category_id', 'news_items', ['category_id'])
    op.create_index('ix_news_items_date', 'news_items', ['date'])
    op.create_index('ix_news_items_url', 'news_items', ['url'])
    # The pipeline's dedup key: skip a URL already stored for that
    # (category, date) tuple. Using a unique constraint instead of
    # application-level dedup makes concurrent inserts safe.
    op.create_unique_constraint(
        'uq_news_items_category_date_url',
        'news_items',
        ['category_id', 'date', 'url'],
    )

    # ── user_news_categories ──────────────────────────────────────────────
    op.create_table(
        'user_news_categories',
        sa.Column(
            'person_id',
            sa.Integer(),
            sa.ForeignKey('person.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column(
            'category_id',
            sa.Integer(),
            sa.ForeignKey('news_categories.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Seed catalog ──────────────────────────────────────────────────────
    # Order matters only for the sort_order column — keeps the chips
    # row stable on the frontend regardless of insertion order.
    op.execute(
        """
        INSERT INTO news_categories
            (slug, label, color, sort_order, mode, gnews_topic, newsapi_category, search_query, is_active)
        VALUES
            ('world',         'World',         '#2563eb', 10, 'native', 'world',         NULL,            NULL, true),
            ('nation',        'Nation',        '#0891b2', 20, 'native', 'nation',        NULL,            NULL, true),
            ('technology',    'Technology',    '#7c3aed', 30, 'native', 'technology',    'technology',    NULL, true),
            ('business',      'Business',      '#16a34a', 40, 'native', 'business',      'business',      NULL, true),
            ('science',       'Science',       '#0d9488', 50, 'native', 'science',       'science',       NULL, true),
            ('health',        'Health',        '#dc2626', 60, 'native', 'health',        'health',        NULL, true),
            ('sports',        'Sports',        '#ea580c', 70, 'native', 'sports',        'sports',        NULL, true),
            ('entertainment', 'Entertainment', '#db2777', 80, 'native', 'entertainment', 'entertainment', NULL, true),
            ('automotive',    'Automotive',    '#475569', 90, 'search', NULL,            NULL,
             'automotive OR "electric vehicle" OR "car review" OR Tesla OR Rivian', true)
        """
    )


def downgrade() -> None:
    op.drop_table('user_news_categories')
    op.drop_index('ix_news_items_url', table_name='news_items')
    op.drop_index('ix_news_items_date', table_name='news_items')
    op.drop_index('ix_news_items_category_id', table_name='news_items')
    op.drop_table('news_items')
    op.drop_index('ix_news_categories_slug', table_name='news_categories')
    op.drop_table('news_categories')
