"""add_dictionary_folders_modules

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-07 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = '179a9af82a91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'dictionary_folders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('color', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dictionary_folders_person_id', 'dictionary_folders', ['person_id'])

    op.create_table(
        'dictionary_modules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('folder_id', sa.Integer(), sa.ForeignKey('dictionary_folders.id', ondelete='CASCADE'), nullable=False),
        sa.Column('person_id', sa.Integer(), sa.ForeignKey('person.id'), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dictionary_modules_folder_id', 'dictionary_modules', ['folder_id'])
    op.create_index('ix_dictionary_modules_person_id', 'dictionary_modules', ['person_id'])

    op.add_column(
        'dictionary_words',
        sa.Column(
            'module_id',
            sa.Integer(),
            sa.ForeignKey('dictionary_modules.id', ondelete='CASCADE'),
            nullable=True,
        ),
    )
    op.create_index('ix_dictionary_words_module_id', 'dictionary_words', ['module_id'])

    # Backfill: for every person that already has dictionary words, create a default
    # "Inbox" folder and "Untagged" module, and assign all their existing words to it.
    bind = op.get_bind()
    persons_with_words = bind.execute(
        sa.text("""
            SELECT DISTINCT person_id
            FROM dictionary_words
            WHERE deleted = false OR deleted IS NULL
        """)
    ).fetchall()

    for (person_id,) in persons_with_words:
        folder_result = bind.execute(
            sa.text("""
                INSERT INTO dictionary_folders (person_id, name, color, created_at, updated_at)
                VALUES (:person_id, :name, :color, NOW(), NOW())
                RETURNING id
            """),
            {"person_id": person_id, "name": "Inbox", "color": "#6b7280"},
        )
        folder_id = folder_result.scalar()

        module_result = bind.execute(
            sa.text("""
                INSERT INTO dictionary_modules (folder_id, person_id, name, description, created_at, updated_at)
                VALUES (:folder_id, :person_id, :name, :description, NOW(), NOW())
                RETURNING id
            """),
            {
                "folder_id": folder_id,
                "person_id": person_id,
                "name": "Untagged",
                "description": "Words imported from before folders/modules existed",
            },
        )
        module_id = module_result.scalar()

        bind.execute(
            sa.text("""
                UPDATE dictionary_words
                SET module_id = :module_id
                WHERE person_id = :person_id AND module_id IS NULL
            """),
            {"module_id": module_id, "person_id": person_id},
        )


def downgrade() -> None:
    op.drop_index('ix_dictionary_words_module_id', table_name='dictionary_words')
    op.drop_column('dictionary_words', 'module_id')
    op.drop_index('ix_dictionary_modules_person_id', table_name='dictionary_modules')
    op.drop_index('ix_dictionary_modules_folder_id', table_name='dictionary_modules')
    op.drop_table('dictionary_modules')
    op.drop_index('ix_dictionary_folders_person_id', table_name='dictionary_folders')
    op.drop_table('dictionary_folders')
