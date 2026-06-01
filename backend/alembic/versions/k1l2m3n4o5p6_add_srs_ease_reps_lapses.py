"""add ease_factor / reps / lapses to dictionary_words for SM-2

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-06-01

Replaces the fixed [1,2,4,7,14,30,60] day ladder with a per-card SM-2
variant. Three new columns on dictionary_words:

  - ease_factor FLOAT NOT NULL DEFAULT 2.5
      Per-card growth multiplier. Drops on lapses (-0.20) and "hard"
      passes (-0.15), never below MIN_EASE=1.3. Fragile cards diverge
      from easy cards instead of marching the same ladder.

  - reps INT NOT NULL DEFAULT 0
      Successful-review counter. Reset to 0 on lapse, incremented on
      every pass. Drives the "first interval / second interval / then
      multiplier" branch in the scheduler.

  - lapses INT NOT NULL DEFAULT 0
      Lifetime forget count. Used to surface leeches (>= 5 lapses)
      and contributes to the redefined `weak_condition`.

Backfill: derive `reps` from existing `interval_days` so mature cards
stay mature instead of all resetting to a 1-day interval on their next
review. ease_factor=2.5 and lapses=0 are safe defaults for legacy rows
(we have no past-lapse data to recover).

`correct_count`/`review_count` are kept but demoted to display-only;
scheduling no longer reads them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, Sequence[str], None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'dictionary_words',
        sa.Column('ease_factor', sa.Float(), nullable=False, server_default='2.5'),
    )
    op.add_column(
        'dictionary_words',
        sa.Column('reps', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'dictionary_words',
        sa.Column('lapses', sa.Integer(), nullable=False, server_default='0'),
    )

    # Backfill reps from the legacy fixed ladder so well-learned cards
    # don't lose their place. interval_days >= N counts how many ladder
    # steps the card has already climbed under the old scheduler.
    op.execute(
        """
        UPDATE dictionary_words SET reps =
              (interval_days >= 1)::int  + (interval_days >= 2)::int
            + (interval_days >= 4)::int  + (interval_days >= 7)::int
            + (interval_days >= 14)::int + (interval_days >= 30)::int
            + (interval_days >= 60)::int
        """
    )


def downgrade() -> None:
    op.drop_column('dictionary_words', 'lapses')
    op.drop_column('dictionary_words', 'reps')
    op.drop_column('dictionary_words', 'ease_factor')
