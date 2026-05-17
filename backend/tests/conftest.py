import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models
from app.dependencies import get_current_user

# Test database URL
TEST_DATABASE_URL = "postgresql://postgres:123@localhost/life_tracker_test"

# Create test engine
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with database session"""

    def override_get_db():
        try:
            yield db_session
        finally:
            db_session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# Authenticated client: a fresh user is committed to the DB and
# get_current_user is overridden to return it. Use this in any test that
# hits a router protected by Depends(get_current_user). The plain `client`
# fixture above is for endpoints that don't need auth (legacy /api/person
# tests, etc.).
@pytest.fixture(scope="function")
def test_user(db_session):
    user = models.Person(
        name="Critical Path User",
        email="critical@test.local",
        hashed_password="not-a-real-hash",
        timezone="Asia/Tashkent",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def auth_client(db_session, test_user):
    """TestClient with both get_db and get_current_user overridden."""

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
def sample_person(client):
    """Create a sample person for testing"""
    response = client.post(
        "/api/person/",  # Changed to match your route
        json={
            "name": "Test User",
            "email": "test@example.com",
            "timezone": "Asia/Tashkent"
        }
    )
    return response.json()


@pytest.fixture
def sample_goal(client, sample_person):
    """Create a sample goal for testing"""
    response = client.post(
        "/api/goal/",  # Update this to match your goal route
        json={
            "name": "Test Goal",
            "description": "Test goal description",
            "category": "Learning",
            "target_value": 10.0,
            "current_value": 5.0,
            "unit": "score",
            "start_date": "2026-01-01",
            "target_date": "2026-12-31",
            "priority": "high",
            "person_id": sample_person["id"]
        }
    )
    return response.json()


@pytest.fixture
def sample_task(client, sample_goal):
    """Create a sample task for testing"""
    response = client.post(
        "/api/task/",  # Update this to match your task route
        json={
            "name": "Test Task",
            "description": "Test task description",
            "task_type": "daily",
            "due_date": "2026-01-17",
            "priority": "high",
            "estimated_duration": 30,
            "goal_id": sample_goal["id"]
        }
    )
    return response.json()