"""
Test suite for savings functionality.
Tests account creation, transactions, interest, balance tracking, and monthly summary.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import date

from app.main import app
from app.database import Base, get_db
from app import models
from app.dependencies import get_current_user

TEST_DATABASE_URL = "postgresql://postgres:123@localhost/life_tracker_test"
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ==================== FIXTURES ====================

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_user(db_session):
    user = models.Person(
        name="Test User",
        email="test@savings.com",
        hashed_password="hashed_password",
        timezone="Asia/Tashkent"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def client(db_session, test_user):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_get_current_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def sample_saving(client):
    """Create a sample saving account with 5,000,000 initial amount"""
    response = client.post("/api/savings/", json={
        "account_name": "Emergency Fund",
        "account_type": "savings",
        "initial_amount": 5_000_000,
        "target_amount": 20_000_000,
        "currency": "UZS",
        "interest_rate": 12.0,
        "start_date": "2026-01-01",
        "risk_level": "low",
        "platform": "National Bank"
    })
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def zero_interest_saving(client):
    """Create a saving account with no interest rate"""
    response = client.post("/api/savings/", json={
        "account_name": "Cash Wallet",
        "account_type": "savings",
        "initial_amount": 2_000_000,
        "currency": "UZS",
        "interest_rate": 0,
        "start_date": "2026-01-01"
    })
    assert response.status_code == 201
    return response.json()


# ==================== ACCOUNT CREATION TESTS ====================

class TestCreateSaving:

    def test_current_balance_auto_set_to_initial_amount(self, client):
        """current_balance must equal initial_amount at creation — not user-provided"""
        response = client.post("/api/savings/", json={
            "account_name": "Test Account",
            "account_type": "savings",
            "initial_amount": 3_000_000,
            "currency": "UZS",
            "start_date": "2026-01-01"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["current_balance"] == 3_000_000
        assert data["initial_amount"] == 3_000_000

    def test_initial_transaction_created_automatically(self, client, db_session):
        """An initial deposit transaction must be created when initial_amount > 0"""
        response = client.post("/api/savings/", json={
            "account_name": "Test Account",
            "account_type": "savings",
            "initial_amount": 5_000_000,
            "currency": "UZS",
            "start_date": "2026-02-01"
        })
        saving_id = response.json()["id"]

        transactions = db_session.query(models.SavingTransaction).filter(
            models.SavingTransaction.saving_id == saving_id
        ).all()

        assert len(transactions) == 1
        tx = transactions[0]
        assert tx.transaction_type == "deposit"
        assert tx.amount == 5_000_000
        assert tx.balance_before == 0.0
        assert tx.balance_after == 5_000_000
        assert tx.description == "Initial deposit"
        assert tx.transaction_date == date(2026, 2, 1)

    def test_no_initial_transaction_when_initial_amount_is_zero(self, client, db_session):
        """No transaction should be created when initial_amount is 0"""
        response = client.post("/api/savings/", json={
            "account_name": "Empty Account",
            "account_type": "savings",
            "initial_amount": 0,
            "currency": "UZS",
            "start_date": "2026-01-01"
        })
        saving_id = response.json()["id"]

        count = db_session.query(models.SavingTransaction).filter(
            models.SavingTransaction.saving_id == saving_id
        ).count()
        assert count == 0

    def test_current_balance_reflects_initial_amount_not_zero(self, client):
        """current_balance should start at initial_amount, not 0"""
        response = client.post("/api/savings/", json={
            "account_name": "Test",
            "account_type": "savings",
            "initial_amount": 1_000_000,
            "currency": "UZS",
            "start_date": "2026-01-01"
        })
        assert response.json()["current_balance"] == 1_000_000


# ==================== DEPOSIT TESTS ====================

class TestDeposit:

    def test_deposit_increases_balance(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/deposit",
            params={"amount": 1_000_000, "transaction_date": "2026-02-10"}
        )
        assert response.status_code == 200
        assert response.json()["balance_after"] == 6_000_000

        saving = client.get(f"/api/savings/{saving_id}").json()
        assert saving["current_balance"] == 6_000_000

    def test_deposit_records_correct_balance_before_and_after(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/deposit",
            params={"amount": 500_000, "transaction_date": "2026-02-05"}
        )
        tx = response.json()
        assert tx["balance_before"] == 5_000_000
        assert tx["balance_after"] == 5_500_000
        assert tx["transaction_type"] == "deposit"
        assert tx["amount"] == 500_000

    def test_multiple_deposits_accumulate(self, client, sample_saving):
        saving_id = sample_saving["id"]
        client.post(f"/api/savings/{saving_id}/deposit",
                    params={"amount": 1_000_000, "transaction_date": "2026-02-01"})
        client.post(f"/api/savings/{saving_id}/deposit",
                    params={"amount": 2_000_000, "transaction_date": "2026-02-15"})

        saving = client.get(f"/api/savings/{saving_id}").json()
        assert saving["current_balance"] == 8_000_000  # 5M + 1M + 2M


# ==================== WITHDRAWAL TESTS ====================

class TestWithdrawal:

    def test_withdrawal_decreases_balance(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/withdraw",
            params={"amount": 1_000_000, "transaction_date": "2026-02-10"}
        )
        assert response.status_code == 200
        assert response.json()["balance_after"] == 4_000_000

        saving = client.get(f"/api/savings/{saving_id}").json()
        assert saving["current_balance"] == 4_000_000

    def test_withdrawal_fails_when_insufficient_balance(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/withdraw",
            params={"amount": 10_000_000, "transaction_date": "2026-02-10"}
        )
        assert response.status_code == 400
        assert "Insufficient balance" in response.json()["detail"]

    def test_withdrawal_records_correct_balances(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/withdraw",
            params={"amount": 2_000_000, "transaction_date": "2026-02-10"}
        )
        tx = response.json()
        assert tx["balance_before"] == 5_000_000
        assert tx["balance_after"] == 3_000_000
        assert tx["transaction_type"] == "withdrawal"

    def test_withdrawal_exact_balance_empties_account(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/withdraw",
            params={"amount": 5_000_000, "transaction_date": "2026-02-10"}
        )
        assert response.status_code == 200
        saving = client.get(f"/api/savings/{saving_id}").json()
        assert saving["current_balance"] == 0.0


# ==================== INTEREST TESTS ====================

class TestApplyInterest:

    def test_apply_interest_calculates_correctly(self, client, sample_saving):
        """12% annual / 12 = 1% monthly on 5,000,000 = 50,000"""
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/apply-interest",
            params={"month": "2026-02"}
        )
        assert response.status_code == 201
        tx = response.json()
        assert tx["transaction_type"] == "interest"
        assert tx["amount"] == 50_000.0
        assert tx["balance_before"] == 5_000_000
        assert tx["balance_after"] == 5_050_000

    def test_apply_interest_updates_current_balance(self, client, sample_saving):
        saving_id = sample_saving["id"]
        client.post(f"/api/savings/{saving_id}/apply-interest", params={"month": "2026-02"})
        saving = client.get(f"/api/savings/{saving_id}").json()
        assert saving["current_balance"] == 5_050_000

    def test_apply_interest_on_last_day_of_month(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/apply-interest",
            params={"month": "2026-02"}
        )
        assert response.json()["transaction_date"] == "2026-02-28"

    def test_apply_interest_fails_when_rate_is_zero(self, client, zero_interest_saving):
        saving_id = zero_interest_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/apply-interest",
            params={"month": "2026-02"}
        )
        assert response.status_code == 400
        assert "no interest rate" in response.json()["detail"]

    def test_apply_interest_twice_same_month_fails(self, client, sample_saving):
        saving_id = sample_saving["id"]
        client.post(f"/api/savings/{saving_id}/apply-interest", params={"month": "2026-02"})
        response = client.post(
            f"/api/savings/{saving_id}/apply-interest",
            params={"month": "2026-02"}
        )
        assert response.status_code == 400
        assert "already applied" in response.json()["detail"]

    def test_apply_interest_different_months_succeeds(self, client, sample_saving):
        saving_id = sample_saving["id"]
        r1 = client.post(f"/api/savings/{saving_id}/apply-interest", params={"month": "2026-01"})
        r2 = client.post(f"/api/savings/{saving_id}/apply-interest", params={"month": "2026-02"})
        assert r1.status_code == 201
        assert r2.status_code == 201

    def test_apply_interest_defaults_to_current_month(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(f"/api/savings/{saving_id}/apply-interest")
        assert response.status_code == 201
        assert response.json()["transaction_type"] == "interest"

    def test_invalid_month_format_returns_400(self, client, sample_saving):
        saving_id = sample_saving["id"]
        response = client.post(
            f"/api/savings/{saving_id}/apply-interest",
            params={"month": "2026/02"}
        )
        assert response.status_code == 400


# ==================== DELETE TRANSACTION TESTS ====================

class TestDeleteTransaction:

    def test_delete_deposit_reverses_balance(self, client, sample_saving):
        saving_id = sample_saving["id"]
        tx = client.post(
            f"/api/savings/{saving_id}/deposit",
            params={"amount": 1_000_000, "transaction_date": "2026-02-10"}
        ).json()

        client.delete(f"/api/savings/{saving_id}/transactions/{tx['id']}")

        saving = client.get(f"/api/savings/{saving_id}").json()
        assert saving["current_balance"] == 5_000_000  # back to original

    def test_delete_withdrawal_reverses_balance(self, client, sample_saving):
        saving_id = sample_saving["id"]
        tx = client.post(
            f"/api/savings/{saving_id}/withdraw",
            params={"amount": 1_000_000, "transaction_date": "2026-02-10"}
        ).json()

        client.delete(f"/api/savings/{saving_id}/transactions/{tx['id']}")

        saving = client.get(f"/api/savings/{saving_id}").json()
        assert saving["current_balance"] == 5_000_000  # back to original

    def test_delete_deposit_fails_when_would_cause_negative_balance(self, client, sample_saving):
        """After withdrawing all money, deleting the initial deposit would go negative"""
        saving_id = sample_saving["id"]

        # Withdraw everything
        client.post(f"/api/savings/{saving_id}/withdraw",
                    params={"amount": 5_000_000, "transaction_date": "2026-02-10"})

        # Try to delete the initial deposit (would make balance -5,000,000)
        txs = client.get(f"/api/savings/{saving_id}/transactions").json()
        initial_tx = next(t for t in txs if t["description"] == "Initial deposit")

        response = client.delete(f"/api/savings/{saving_id}/transactions/{initial_tx['id']}")
        assert response.status_code == 400
        assert "negative balance" in response.json()["detail"]


# ==================== MONTHLY SUMMARY TESTS ====================

class TestMonthlySummary:

    def test_closing_balance_carries_forward_when_no_activity(self, client, sample_saving):
        """Months with no transactions should carry the previous closing balance"""
        saving_id = sample_saving["id"]

        # Deposit in Jan only
        client.post(f"/api/savings/{saving_id}/deposit",
                    params={"amount": 1_000_000, "transaction_date": "2026-01-15"})

        response = client.get(f"/api/savings/{saving_id}/monthly-summary",
                               params={"months": 3})
        assert response.status_code == 200
        summaries = response.json()["summaries"]

        # Find Feb and Mar — should carry Jan's closing balance
        for s in summaries:
            if s["period"] in ("2026-02", "2026-03"):
                assert s["total_deposited"] == 0
                assert s["net_change"] == 0

    def test_net_change_equals_deposited_minus_withdrawn_plus_interest(self, client, sample_saving):
        saving_id = sample_saving["id"]

        client.post(f"/api/savings/{saving_id}/deposit",
                    params={"amount": 2_000_000, "transaction_date": "2026-02-05"})
        client.post(f"/api/savings/{saving_id}/withdraw",
                    params={"amount": 500_000, "transaction_date": "2026-02-10"})
        client.post(f"/api/savings/{saving_id}/apply-interest",
                    params={"month": "2026-02"})

        response = client.get(f"/api/savings/{saving_id}/monthly-summary",
                               params={"months": 6})
        feb = next(s for s in response.json()["summaries"] if s["period"] == "2026-02")

        assert feb["total_deposited"] == 2_000_000
        assert feb["total_withdrawn"] == 500_000
        assert feb["interest_earned"] == pytest.approx(65_000.0, rel=0.01)  # 6,500,000 * 12% / 12
        assert feb["net_change"] == pytest.approx(feb["total_deposited"] + feb["interest_earned"] - feb["total_withdrawn"], rel=0.01)

    def test_closing_balance_matches_actual_account_balance(self, client, sample_saving):
        """closing_balance in the current month should equal current_balance on the account"""
        saving_id = sample_saving["id"]

        client.post(f"/api/savings/{saving_id}/deposit",
                    params={"amount": 1_000_000, "transaction_date": "2026-02-10"})

        today = date.today()
        current_month = today.strftime("%Y-%m")

        response = client.get(f"/api/savings/{saving_id}/monthly-summary",
                               params={"months": 6})
        summaries = response.json()["summaries"]
        current = next((s for s in summaries if s["period"] == current_month), None)

        if current:
            saving = client.get(f"/api/savings/{saving_id}").json()
            assert current["closing_balance"] == saving["current_balance"]

    def test_aggregated_summary_sums_across_accounts(self, client, test_user):
        """Aggregated summary should sum balances from all savings accounts"""
        # Create two accounts
        r1 = client.post("/api/savings/", json={
            "account_name": "Account A",
            "account_type": "savings",
            "initial_amount": 3_000_000,
            "currency": "UZS",
            "start_date": "2026-01-01"
        }).json()

        r2 = client.post("/api/savings/", json={
            "account_name": "Account B",
            "account_type": "savings",
            "initial_amount": 2_000_000,
            "currency": "UZS",
            "start_date": "2026-01-01"
        }).json()

        response = client.get("/api/savings/monthly-summary", params={"months": 3})
        assert response.status_code == 200
        summaries = response.json()["summaries"]

        # Find a month where both accounts exist
        jan = next((s for s in summaries if s["period"] == "2026-01"), None)
        if jan:
            assert jan["total_closing_balance"] == 5_000_000
            assert "Account A" in jan["by_account"]
            assert "Account B" in jan["by_account"]
            assert jan["by_account"]["Account A"] == 3_000_000
            assert jan["by_account"]["Account B"] == 2_000_000


# ==================== SCHEMA VALIDATION TESTS ====================

class TestSchemaValidation:

    def test_create_with_current_balance_in_body_is_rejected(self, client):
        """current_balance must not be accepted in create request — server sets it automatically"""
        response = client.post("/api/savings/", json={
            "account_name": "Test",
            "account_type": "savings",
            "initial_amount": 5_000_000,
            "current_balance": 999_999,   # should be rejected
            "currency": "UZS",
            "start_date": "2026-01-01"
        })
        assert response.status_code == 422  # Unprocessable Entity

    def test_current_balance_always_equals_initial_amount_regardless_of_input(self, client):
        """Even if client somehow bypasses schema, current_balance must equal initial_amount"""
        response = client.post("/api/savings/", json={
            "account_name": "Test",
            "account_type": "savings",
            "initial_amount": 3_000_000,
            "currency": "UZS",
            "start_date": "2026-01-01"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["current_balance"] == data["initial_amount"]

    def test_update_cannot_change_current_balance_directly(self, client, sample_saving):
        """current_balance should only change through transactions, not PUT"""
        saving_id = sample_saving["id"]
        response = client.put(f"/api/savings/{saving_id}", json={
            "current_balance": 999_999_999
        })
        # Either rejected (422) or the field is silently ignored
        if response.status_code == 200:
            saving = client.get(f"/api/savings/{saving_id}").json()
            assert saving["current_balance"] == 5_000_000  # unchanged

    def test_update_cannot_change_initial_amount(self, client, sample_saving):
        """initial_amount should be immutable after creation"""
        saving_id = sample_saving["id"]
        response = client.put(f"/api/savings/{saving_id}", json={
            "initial_amount": 1
        })
        if response.status_code == 200:
            saving = client.get(f"/api/savings/{saving_id}").json()
            assert saving["initial_amount"] == 5_000_000  # unchanged

    def test_create_requires_initial_amount(self, client):
        """initial_amount is required"""
        response = client.post("/api/savings/", json={
            "account_name": "Test",
            "account_type": "savings",
            "currency": "UZS",
            "start_date": "2026-01-01"
        })
        assert response.status_code == 422

    def test_create_rejects_negative_initial_amount(self, client):
        """initial_amount must be >= 0"""
        response = client.post("/api/savings/", json={
            "account_name": "Test",
            "account_type": "savings",
            "initial_amount": -1000,
            "currency": "UZS",
            "start_date": "2026-01-01"
        })
        assert response.status_code == 422

    def test_update_interest_rate_blocked_when_account_already_started(self, client, sample_saving):
        """interest_rate cannot be changed once start_date is in the past"""
        # sample_saving has start_date = "2026-01-01" which is in the past
        saving_id = sample_saving["id"]

        response = client.put(f"/api/savings/{saving_id}", json={
            "interest_rate": 99.0
        })
        assert response.status_code == 400
        assert "Cannot change interest_rate" in response.json()["detail"]

    def test_update_interest_rate_allowed_before_account_starts(self, client):
        """interest_rate can be changed if start_date is in the future"""
        future_saving = client.post("/api/savings/", json={
            "account_name": "Future Account",
            "account_type": "savings",
            "initial_amount": 1_000_000,
            "currency": "UZS",
            "interest_rate": 10.0,
            "start_date": "2030-01-01"  # future date
        }).json()

        response = client.put(f"/api/savings/{future_saving['id']}", json={
            "interest_rate": 15.0
        })
        assert response.status_code == 200
        assert response.json()["interest_rate"] == 15.0


# ==================== SOFT DELETE TESTS ====================

class TestSoftDelete:

    def test_deleted_saving_not_returned_in_list(self, client, sample_saving):
        saving_id = sample_saving["id"]
        client.delete(f"/api/savings/{saving_id}")

        response = client.get("/api/savings/")
        ids = [s["id"] for s in response.json()]
        assert saving_id not in ids

    def test_deleted_saving_appears_in_deleted_list(self, client, sample_saving, test_user):
        saving_id = sample_saving["id"]
        client.delete(f"/api/savings/{saving_id}")

        response = client.get(f"/api/savings/by-person/{test_user.id}/deleted")
        assert response.status_code == 200
        ids = [s["id"] for s in response.json()]
        assert saving_id in ids

    def test_get_by_person_returns_only_active(self, client, sample_saving, test_user):
        saving_id = sample_saving["id"]
        client.delete(f"/api/savings/{saving_id}")

        response = client.get(f"/api/savings/by-person/{test_user.id}")
        ids = [s["id"] for s in response.json()]
        assert saving_id not in ids
