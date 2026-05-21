"""Gennis salary sync.

Mirrors the external Gennis CRM's teacher salary tables into life_tracker:

    teachersalary    (per-location monthly aggregate)  ──► SalaryMonth
    teachersalaries  (individual payment ledger rows)  ──► GennisSalaryPayment

This module is the only writer to life_tracker for these mirrored fields.
Connection to Gennis is read-only — see app.external_models.gennis.

Sync semantics (full mirror, per the user's spec):
- A SalaryMonth row exists for every Gennis teachersalary row.
- `salary_amount`, `net_amount` are overwritten from `total_salary`.
- `total_spent` is overwritten from `taken_money` so it reflects real payouts.
- `remaining_amount` is overwritten from `remaining_salary`.
- `gennis_debt`, `gennis_fine`, `gennis_status` mirror verbatim.
- Per-payment rows are mirrored into GennisSalaryPayment, keyed on Gennis PK.
  Rows missing from the latest Gennis result are deleted so cancelled
  payments disappear locally too.

Sync is triggered on-demand by callers (typically `ensure_fresh` from a read
endpoint) — there is no Celery cron.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.external_models.gennis import (
    GennisTeacher,
    GennisTeacherPayment,
    GennisTeacherSalary,
    GennisUser,
    gennis_session,
    is_configured,
)


logger = logging.getLogger(__name__)


# ─── Report ───────────────────────────────────────────────────────────────────
@dataclass
class SyncReport:
    job_id: int
    months_inserted: int = 0
    months_updated: int = 0
    payments_inserted: int = 0
    payments_updated: int = 0
    payments_deleted: int = 0
    skipped_reason: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _month_str(salary_row: GennisTeacherSalary) -> Optional[str]:
    if salary_row.month is None or salary_row.month.date is None:
        return None
    return salary_row.month.date.strftime("%Y-%m")


def _payment_date(payment: GennisTeacherPayment) -> Optional[date]:
    d = payment.day.date if payment.day else None
    if isinstance(d, datetime):
        return d.date()
    return d


# ─── Public API ───────────────────────────────────────────────────────────────
def sync_job(job: models.Job, db: Session) -> SyncReport:
    """Mirror the configured Gennis teacher's salary data into this job."""
    report = SyncReport(job_id=job.id)

    if not job.gennis_username:
        report.skipped_reason = "no gennis_username on job"
        return report
    if not is_configured():
        report.skipped_reason = "GENNIS_DB_URL not configured"
        return report

    with gennis_session() as gs:
        user = (
            gs.query(GennisUser)
            .filter(GennisUser.username == job.gennis_username)
            .first()
        )
        if user is None:
            report.skipped_reason = f"gennis user {job.gennis_username!r} not found"
            return report

        teacher = (
            gs.query(GennisTeacher).filter(GennisTeacher.user_id == user.id).first()
        )
        if teacher is None:
            report.skipped_reason = f"gennis user_id={user.id} has no teachers row"
            return report

        gennis_months = (
            gs.query(GennisTeacherSalary)
            .filter(GennisTeacherSalary.teacher_id == teacher.id)
            .all()
        )
        gennis_payments = (
            gs.query(GennisTeacherPayment)
            .filter(GennisTeacherPayment.teacher_id == teacher.id)
            .all()
        )

    # ── Upsert monthly rows ─────────────────────────────────────────────
    existing_by_loc: dict[int, models.SalaryMonth] = {
        sm.gennis_salary_location_id: sm
        for sm in db.query(models.SalaryMonth)
        .filter(
            models.SalaryMonth.job_id == job.id,
            models.SalaryMonth.gennis_salary_location_id.isnot(None),
        )
        .all()
    }
    existing_by_month: dict[str, models.SalaryMonth] = {
        sm.month: sm
        for sm in db.query(models.SalaryMonth)
        .filter(models.SalaryMonth.job_id == job.id)
        .all()
    }

    month_id_by_loc: dict[int, int] = {}

    for gm in gennis_months:
        month_str = _month_str(gm)
        if month_str is None:
            continue

        sm = existing_by_loc.get(gm.id) or existing_by_month.get(month_str)
        total = float(gm.total_salary or 0)
        taken = float(gm.taken_money or 0)
        remaining = float(gm.remaining_salary or 0)
        debt = float(gm.debt or 0)
        fine = float(gm.total_fine or 0)
        closed = bool(gm.status)

        if sm is None:
            sm = models.SalaryMonth(
                job_id=job.id,
                person_id=job.person_id,
                month=month_str,
                salary_amount=total or 0.01,
                deductions=0.0,
                net_amount=total or 0.01,
                total_spent=taken,
                remaining_amount=remaining,
                gennis_salary_location_id=gm.id,
                gennis_debt=debt,
                gennis_fine=fine,
                gennis_status=closed,
                deleted=False,
            )
            db.add(sm)
            db.flush()
            report.months_inserted += 1
        else:
            sm.month = month_str
            sm.salary_amount = total or sm.salary_amount
            sm.net_amount = total or sm.net_amount
            sm.total_spent = taken
            sm.remaining_amount = remaining
            sm.gennis_salary_location_id = gm.id
            sm.gennis_debt = debt
            sm.gennis_fine = fine
            sm.gennis_status = closed
            sm.deleted = False
            report.months_updated += 1
        month_id_by_loc[gm.id] = sm.id

    # ── Upsert payments, then delete stale rows ─────────────────────────
    existing_payments: dict[int, models.GennisSalaryPayment] = {
        p.gennis_payment_id: p
        for p in db.query(models.GennisSalaryPayment)
        .filter(models.GennisSalaryPayment.person_id == job.person_id)
        .all()
    }

    seen_payment_ids: set[int] = set()
    for gp in gennis_payments:
        sm_id = month_id_by_loc.get(gp.salary_location_id)
        if sm_id is None:
            # Payment references a teachersalary row we didn't import (e.g.
            # different location not yet linked); skip it.
            continue
        seen_payment_ids.add(gp.id)

        existing = existing_payments.get(gp.id)
        amount = float(gp.payment_sum or 0)
        reason = (gp.reason or None)
        payment_type_name = gp.payment_type.name if gp.payment_type else None
        pdate = _payment_date(gp)

        if existing is None:
            db.add(
                models.GennisSalaryPayment(
                    salary_month_id=sm_id,
                    person_id=job.person_id,
                    gennis_payment_id=gp.id,
                    gennis_salary_location_id=gp.salary_location_id,
                    amount=amount,
                    reason=reason,
                    payment_date=pdate,
                    payment_type_id=gp.payment_type_id,
                    payment_type=payment_type_name,
                )
            )
            report.payments_inserted += 1
        else:
            existing.salary_month_id = sm_id
            existing.gennis_salary_location_id = gp.salary_location_id
            existing.amount = amount
            existing.reason = reason
            existing.payment_date = pdate
            existing.payment_type_id = gp.payment_type_id
            existing.payment_type = payment_type_name
            report.payments_updated += 1

    stale_ids = set(existing_payments.keys()) - seen_payment_ids
    if stale_ids:
        db.query(models.GennisSalaryPayment).filter(
            models.GennisSalaryPayment.gennis_payment_id.in_(stale_ids),
            models.GennisSalaryPayment.person_id == job.person_id,
        ).delete(synchronize_session=False)
        report.payments_deleted = len(stale_ids)

    job.gennis_last_synced_at = datetime.utcnow()
    db.commit()
    return report


# Default freshness window. Read endpoints sync at most once every 5 minutes.
DEFAULT_FRESHNESS = timedelta(minutes=5)


def ensure_fresh(
    job: models.Job,
    db: Session,
    max_age: timedelta = DEFAULT_FRESHNESS,
) -> Optional[SyncReport]:
    """Sync the job from Gennis if its last sync is older than `max_age`.

    Returns the SyncReport when a sync ran, or None if cache was still warm
    or sync was skipped (e.g., job not configured for Gennis).
    """
    if not job.gennis_sync_enabled or not job.gennis_username:
        return None
    if not is_configured():
        return None

    last = job.gennis_last_synced_at
    if last is not None and (datetime.utcnow() - last) < max_age:
        return None

    try:
        return sync_job(job, db)
    except Exception:
        logger.exception("[gennis_sync] ensure_fresh failed for job_id=%s", job.id)
        db.rollback()
        return None


def ensure_fresh_for_person(
    person_id: int,
    db: Session,
    max_age: timedelta = DEFAULT_FRESHNESS,
) -> list[SyncReport]:
    """Refresh every Gennis-synced job belonging to a person."""
    jobs = (
        db.query(models.Job)
        .filter(
            models.Job.person_id == person_id,
            models.Job.gennis_sync_enabled.is_(True),
            models.Job.gennis_username.isnot(None),
            models.Job.deleted.is_(False),
        )
        .all()
    )
    reports: list[SyncReport] = []
    for job in jobs:
        r = ensure_fresh(job, db, max_age=max_age)
        if r is not None:
            reports.append(r)
    return reports
