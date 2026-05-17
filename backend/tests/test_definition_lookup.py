"""Critical-path test: the AI → dictionaryapi.dev → Wiktionary chain.

The recent "hallmarks blank" + "dunk blank" bugs came from a single
lookup step failing silently. The chain is meant to fall through to the
next provider when the previous one returns an empty definition. Mock
each layer with monkeypatch so the test never hits the network.

This is a pure-function test of the helper that the highlight save path
calls — it doesn't need a TestClient.
"""
from app.routers import books as books_router


def test_ai_definition_wins_when_available(monkeypatch):
    monkeypatch.setattr(books_router, "_ai_word_lookup",
                        lambda word, context=None: ("from-AI", "ai-translation"))
    monkeypatch.setattr(books_router, "_dictionary_api_lookup",
                        lambda word: pytest_fail("dictionaryapi.dev should not be called"))
    monkeypatch.setattr(books_router, "_wiktionary_lookup",
                        lambda word: pytest_fail("wiktionary should not be called"))

    definition, translation = books_router._lookup_definition("hallmarks", "in context")
    assert definition == "from-AI"
    assert translation == "ai-translation"


def test_falls_back_to_dictionary_api_when_ai_empty(monkeypatch):
    """AI returns no definition (rate-limited, parse error, etc.) — chain
    must consult dictionaryapi.dev next."""
    monkeypatch.setattr(books_router, "_ai_word_lookup",
                        lambda word, context=None: ("", ""))
    monkeypatch.setattr(books_router, "_dictionary_api_lookup",
                        lambda word: "from-dictionary-api")
    monkeypatch.setattr(books_router, "_wiktionary_lookup",
                        lambda word: pytest_fail("wiktionary should not be called when dictionaryapi has it"))

    definition, translation = books_router._lookup_definition("hallmarks")
    assert definition == "from-dictionary-api"
    # Translation only ever comes from the AI step; the two dictionary
    # APIs are English-only. Falling back keeps translation empty.
    assert translation == ""


def test_falls_through_to_wiktionary_when_both_above_miss(monkeypatch):
    """dictionaryapi.dev returns 404 for "dunk" — chain must reach
    Wiktionary, which has broader coverage."""
    monkeypatch.setattr(books_router, "_ai_word_lookup",
                        lambda word, context=None: ("", ""))
    monkeypatch.setattr(books_router, "_dictionary_api_lookup",
                        lambda word: "")
    monkeypatch.setattr(books_router, "_wiktionary_lookup",
                        lambda word: "To submerge briefly in a liquid.")

    definition, translation = books_router._lookup_definition("dunk")
    assert definition == "To submerge briefly in a liquid."
    assert translation == ""


def test_returns_empty_when_all_providers_miss(monkeypatch):
    """Last-resort: every provider unavailable → empty tuple, never raises.
    The caller (create_highlight) is responsible for substituting the
    placeholder definition so the row isn't blank."""
    monkeypatch.setattr(books_router, "_ai_word_lookup",
                        lambda word, context=None: ("", ""))
    monkeypatch.setattr(books_router, "_dictionary_api_lookup",
                        lambda word: "")
    monkeypatch.setattr(books_router, "_wiktionary_lookup",
                        lambda word: "")

    definition, translation = books_router._lookup_definition("madeupword")
    assert definition == ""
    assert translation == ""


def pytest_fail(msg):
    """Helper that asserts immediately — used inside lambda monkeypatches
    where the lambda is expected NOT to fire. Importing pytest at module
    scope and using `pytest.fail` directly works too; this just keeps the
    lambda body single-expression."""
    raise AssertionError(msg)
