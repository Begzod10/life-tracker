"""gennis salary sync — mirror teachersalary + teachersalaries into life_tracker

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-05-21

Adds:
- jobs.gennis_username, jobs.gennis_sync_enabled, jobs.gennis_last_synced_at
- salary_months.gennis_salary_location_id (uniq), gennis_debt, gennis_fine, gennis_status
- new table gennis_salary_payments (per-payment cache, FK -> salary_months)

Idempotent — safe to re-run.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # ─── jobs ────────────────────────────────────────────────────────────
    if not _column_exists("jobs", "gennis_username"):
        op.add_column("jobs", sa.Column("gennis_username", sa.String(length=120), nullable=True))
        op.create_index("ix_jobs_gennis_username", "jobs", ["gennis_username"])

    if not _column_exists("jobs", "gennis_sync_enabled"):
        op.add_column(
            "jobs",
            sa.Column("gennis_sync_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    if not _column_exists("jobs", "gennis_last_synced_at"):
        op.add_column("jobs", sa.Column("gennis_last_synced_at", sa.DateTime(), nullable=True))

    # ─── salary_months ───────────────────────────────────────────────────
    if not _column_exists("salary_months", "gennis_salary_location_id"):
        op.add_column(
            "salary_months",
            sa.Column("gennis_salary_location_id", sa.Integer(), nullable=True),
        )
        op.create_index(
            "ix_salary_months_gennis_salary_location_id",
            "salary_months",
            ["gennis_salary_location_id"],
            unique=True,
        )

    if not _column_exists("salary_months", "gennis_debt"):
        op.add_column("salary_months", sa.Column("gennis_debt", sa.Float(), nullable=True))
    if not _column_exists("salary_months", "gennis_fine"):
        op.add_column("salary_months", sa.Column("gennis_fine", sa.Float(), nullable=True))
    if not _column_exists("salary_months", "gennis_status"):
        op.add_column("salary_months", sa.Column("gennis_status", sa.Boolean(), nullable=True))

    # ─── gennis_salary_payments ──────────────────────────────────────────
    if not _table_exists("gennis_salary_payments"):
        op.create_table(
            "gennis_salary_payments",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column(
                "salary_month_id",
                sa.Integer(),
                sa.ForeignKey("salary_months.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "person_id",
                sa.Integer(),
                sa.ForeignKey("person.id"),
                nullable=False,
            ),
            sa.Column("gennis_payment_id", sa.Integer(), nullable=False, unique=True),
            sa.Column("gennis_salary_location_id", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("reason", sa.String(length=300), nullable=True),
            sa.Column("payment_date", sa.Date(), nullable=True),
            sa.Column("payment_type_id", sa.Integer(), nullable=True),
            sa.Column("payment_type", sa.String(length=20), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index(
            "ix_gennis_salary_payments_salary_month_id",
            "gennis_salary_payments",
            ["salary_month_id"],
        )
        op.create_index(
            "ix_gennis_salary_payments_person_id",
            "gennis_salary_payments",
            ["person_id"],
        )
        op.create_index(
            "ix_gennis_salary_payments_gennis_payment_id",
            "gennis_salary_payments",
            ["gennis_payment_id"],
            unique=True,
        )
        op.create_index(
            "ix_gennis_salary_payments_gennis_salary_location_id",
            "gennis_salary_payments",
            ["gennis_salary_location_id"],
        )
        op.create_index(
            "ix_gennis_salary_payments_payment_date",
            "gennis_salary_payments",
            ["payment_date"],
        )


def downgrade() -> None:
    if _table_exists("gennis_salary_payments"):
        op.drop_index("ix_gennis_salary_payments_payment_date", table_name="gennis_salary_payments")
        op.drop_index("ix_gennis_salary_payments_gennis_salary_location_id", table_name="gennis_salary_payments")
        op.drop_index("ix_gennis_salary_payments_gennis_payment_id", table_name="gennis_salary_payments")
        op.drop_index("ix_gennis_salary_payments_person_id", table_name="gennis_salary_payments")
        op.drop_index("ix_gennis_salary_payments_salary_month_id", table_name="gennis_salary_payments")
        op.drop_table("gennis_salary_payments")

    for col in ("gennis_status", "gennis_fine", "gennis_debt"):
        if _column_exists("salary_months", col):
            op.drop_column("salary_months", col)
    if _column_exists("salary_months", "gennis_salary_location_id"):
        op.drop_index("ix_salary_months_gennis_salary_location_id", table_name="salary_months")
        op.drop_column("salary_months", "gennis_salary_location_id")

    for col in ("gennis_last_synced_at", "gennis_sync_enabled"):
        if _column_exists("jobs", col):
            op.drop_column("jobs", col)
    if _column_exists("jobs", "gennis_username"):
        op.drop_index("ix_jobs_gennis_username", table_name="jobs")
        op.drop_column("jobs", "gennis_username")
