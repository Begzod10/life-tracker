"""Critical-path tests for the book-reader highlight + dictionary flow.

Covers:
- Creating a vocab highlight with save_to_dictionary=True creates a
  DictionaryWord, falls back to the placeholder definition when the AI
  chain is unreachable in tests, and never raises.
- POST .../refresh-definition replaces the placeholder once the lookup
  chain returns a real definition.
- A second save of the same word does NOT spawn a duplicate row.

These would have caught the "hallmarks saved with blank definition"
bug and the per-word dedup regressions we shipped fixes for.
"""
from datetime import datetime

import pytest

from app import models
from app.routers import books as books_router


@pytest.fixture
def sample_book(db_session, test_user):
    book = models.Book(
        person_id=test_user.id,
        title="Critical Path Book",
        author="Test Author",
        file_path="test/missing.pdf",  # not read; highlight endpoints don't open the file
        total_pages=10,
        current_page=1,
        status="reading",
        deleted=False,
    )
    db_session.add(book)
    db_session.commit()
    db_session.refresh(book)
    return book


def test_vocab_highlight_creates_dictionary_word_with_placeholder(
    auth_client, db_session, test_user, sample_book, monkeypatch
):
    """When the AI + dictionary fallback chain returns nothing, the word
    must still be saved with the placeholder definition — never silently
    dropped, never crashing the save endpoint."""
    monkeypatch.setattr(books_router, "_lookup_definition", lambda word, context=None: ("", ""))

    response = auth_client.post(
        f"/api/books/{sample_book.id}/highlights",
        json={
            "page": 5,
            "text": "hallmarks",
            "kind": "vocab",
            "save_to_dictionary": True,
        },
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["text"] == "hallmarks"
    assert payload["dictionary_word_id"] is not None
    # Placeholder definition is what the user sees as an italic prompt in
    # the dictionary row — never an empty string, never None.
    assert payload["definition"] == "(saved from reader — fill definition)"
    assert payload["translation"] is None

    # And the DictionaryWord row really exists.
    word = (
        db_session.query(models.DictionaryWord)
        .filter(models.DictionaryWord.id == payload["dictionary_word_id"])
        .first()
    )
    assert word is not None
    assert word.word == "hallmarks"
    assert word.person_id == test_user.id


def test_refresh_definition_replaces_placeholder(
    auth_client, db_session, test_user, sample_book, monkeypatch
):
    """After save, calling refresh-definition with a working lookup chain
    must replace the placeholder with a real definition + translation."""
    # First save: chain unreachable → row gets placeholder.
    monkeypatch.setattr(books_router, "_lookup_definition", lambda word, context=None: ("", ""))
    save = auth_client.post(
        f"/api/books/{sample_book.id}/highlights",
        json={"page": 5, "text": "hallmarks", "kind": "vocab", "save_to_dictionary": True},
    )
    assert save.status_code == 201
    highlight_id = save.json()["id"]

    # Now the lookup chain "comes online" — pretend Wiktionary returned.
    monkeypatch.setattr(
        books_router,
        "_lookup_definition",
        lambda word, context=None: ("A distinguishing characteristic.", "alomat / отличительный признак"),
    )
    refresh = auth_client.post(
        f"/api/books/{sample_book.id}/highlights/{highlight_id}/refresh-definition"
    )

    assert refresh.status_code == 200, refresh.text
    refreshed = refresh.json()
    assert refreshed["definition"] == "A distinguishing characteristic."
    assert refreshed["translation"] == "alomat / отличительный признак"


def test_duplicate_vocab_save_does_not_create_second_word(
    auth_client, db_session, test_user, sample_book, monkeypatch
):
    """Saving the same selection twice (e.g. user double-clicks Save) must
    re-use the existing DictionaryWord rather than piling up duplicates."""
    monkeypatch.setattr(books_router, "_lookup_definition", lambda word, context=None: ("", ""))

    first = auth_client.post(
        f"/api/books/{sample_book.id}/highlights",
        json={"page": 5, "text": "skeptics", "kind": "vocab", "save_to_dictionary": True},
    )
    second = auth_client.post(
        f"/api/books/{sample_book.id}/highlights",
        json={"page": 5, "text": "skeptics", "kind": "vocab", "save_to_dictionary": True},
    )
    assert first.status_code == 201
    assert second.status_code == 201
    # Same dictionary word id — saved once.
    assert first.json()["dictionary_word_id"] == second.json()["dictionary_word_id"]

    count = (
        db_session.query(models.DictionaryWord)
        .filter(models.DictionaryWord.person_id == test_user.id)
        .count()
    )
    assert count == 1
