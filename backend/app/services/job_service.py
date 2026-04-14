"""
Job Service
Handles automatic salary month generation from job data.
"""
import logging
from datetime import date
from sqlalchemy.orm import Session
from typing import List, Tuple

from app import models
from app.database import SessionLocal

logger = logging.getLogger(__name__)


class JobService:

    @staticmethod
    def generate_salary_months(job: models.Job, db: Session) -> Tuple[List[models.SalaryMonth], List[str]]:
        """
        Create a SalaryMonth record for every calendar month the job covers.

        Salary values are taken directly from job.salary:
            salary_amount = job.salary  (gross)
            deductions    = 0.0
            net_amount    = job.salary
            remaining     = job.salary

        Range:
            start  – first day of job.start_date's month
            end    – first day of job.end_date's month  (or current month if still active)

        Already-existing records for a month are skipped without error.

        Returns:
            created  – list of newly persisted SalaryMonth objects
            skipped  – list of month strings ("YYYY-MM") that already had a record
        """
        start = date(job.start_date.year, job.start_date.month, 1)

        end_boundary = job.end_date if job.end_date else date.today()
        end = date(end_boundary.year, end_boundary.month, 1)

        existing_months = {
            row.month
            for row in db.query(models.SalaryMonth.month).filter(
                models.SalaryMonth.job_id == job.id
            ).all()
        }

        created: List[models.SalaryMonth] = []
        skipped: List[str] = []

        current = start
        while current <= end:
            month_str = current.strftime("%Y-%m")

            if month_str in existing_months:
                skipped.append(month_str)
            else:
                record = models.SalaryMonth(
                    job_id=job.id,
                    person_id=job.person_id,
                    month=month_str,
                    salary_amount=job.salary,
                    deductions=0.0,
                    net_amount=job.salary,
                    remaining_amount=job.salary,
                )
                db.add(record)
                db.flush()
                created.append(record)

            # advance one month without external libs
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)

        db.commit()
        for record in created:
            db.refresh(record)

        return created, skipped

    @staticmethod
    def create_current_month_for_all_jobs() -> None:
        """
        Scheduled task — runs on the 1st of every month.

        Opens its own DB session, queries every active non-deleted job,
        and creates a SalaryMonth for the current calendar month if one
        does not already exist.  Salary is taken from job.salary.
        """
        db: Session = SessionLocal()
        try:
            today = date.today()
            month_str = today.strftime("%Y-%m")

            active_jobs = db.query(models.Job).filter(
                models.Job.active == True,
                models.Job.deleted == False,
            ).all()

            logger.info(f"[JobService] Running for month={month_str}, found {len(active_jobs)} active job(s)")

            created_count = 0
            for job in active_jobs:
                already_exists = db.query(models.SalaryMonth).filter(
                    models.SalaryMonth.job_id == job.id,
                    models.SalaryMonth.month == month_str,
                ).first()

                if already_exists:
                    logger.info(f"[JobService] job_id={job.id} already has a record for {month_str}, skipping")
                    continue

                record = models.SalaryMonth(
                    job_id=job.id,
                    person_id=job.person_id,
                    month=month_str,
                    salary_amount=job.salary,
                    deductions=0.0,
                    net_amount=job.salary,
                    remaining_amount=job.salary,
                )
                db.add(record)
                created_count += 1

            db.commit()
            logger.info(f"[JobService] Done — created {created_count} SalaryMonth record(s) for {month_str}")
        except Exception:
            logger.exception("[JobService] create_current_month_for_all_jobs failed")
            db.rollback()
        finally:
            db.close()
