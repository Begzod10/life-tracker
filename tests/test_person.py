import pytest


def test_create_person(client):
    """Test creating a new person"""
    response = client.post(
        "/api/person/",  # Your actual route
        json={
            "name": "Begzod",
            "email": "begzod@example.com",  # Use consistent email
            "timezone": "Asia/Tashkent"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Begzod"
    assert data["email"] == "begzod@example.com"
    assert "id" in data


def test_create_person_duplicate_email(client, sample_person):
    """Test creating a person with duplicate email"""
    response = client.post(
        "/api/person/",  # Changed from /persons/
        json={
            "name": "Another User",
            "email": sample_person["email"],
            "timezone": "UTC"
        }
    )
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


def test_get_person(client, sample_person):
    """Test getting a person by ID"""
    response = client.get(f"/api/person/{sample_person['id']}")  # Changed
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == sample_person["id"]
    assert data["email"] == sample_person["email"]


def test_get_person_not_found(client):
    """Test getting a non-existent person"""
    response = client.get("/api/person/9999")  # Changed
    assert response.status_code == 404


def test_update_person(client, sample_person):
    """Test updating a person"""
    response = client.put(
        f"/api/person/{sample_person['id']}",  # Changed
        json={
            "name": "Updated Name",
            "timezone": "UTC"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["timezone"] == "UTC"


def test_delete_person(client, sample_person):
    """Test deleting a person"""
    response = client.delete(f"/api/person/{sample_person['id']}")  # Changed
    assert response.status_code == 204

    # Verify person is deleted
    get_response = client.get(f"/api/person/{sample_person['id']}")  # Changed
    assert get_response.status_code == 404


def test_list_persons(client, sample_person):
    """Test listing all persons"""
    response = client.get("/api/person/")  # Changed
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
