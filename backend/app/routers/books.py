"""Books library router.

The PDF files themselves are stored on disk at
    backend/uploads/books/<person_id>/<book_id>.pdf
and streamed back through an auth-gated endpoint — never exposed via
StaticFiles, since each file belongs to one user.
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user
from app.services.books_helpers import (
    _DEDUP_STRIP,
    _extract_pdf_metadata,
    _highlight_counts_for,
    _lookup_definition,
    _norm_word_for_dedup,
    _own_book_or_404,
    _serialize_book,
    _serialize_highlight,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["books"])

UPLOAD_ROOT = Path(os.environ.get(
    "BOOKS_UPLOAD_DIR",
    str(Path(__file__).resolve().parents[2] / "uploads" / "books"),
))
MAX_FILE_BYTES = 60 * 1024 * 1024  # 60 MB
ALLOWED_EXT = {".pdf"}
ALLOWED_STATUSES = {"want", "reading", "done"}


def _user_dir(person_id: int) -> Path:
    d = UPLOAD_ROOT / str(person_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_filename(raw: str) -> str:
    base = os.path.basename(raw or "")
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    return base[:120] or f"book-{uuid.uuid4().hex[:8]}.pdf"


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
def list_books(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.Book).filter(
        models.Book.person_id == current_user.id,
        models.Book.deleted == False,
    )
    if status_filter and status_filter in ALLOWED_STATUSES:
        q = q.filter(models.Book.status == status_filter)
    books = q.order_by(
        models.Book.last_opened_at.desc().nullslast(),
        models.Book.created_at.desc(),
    ).all()

    counts = _highlight_counts_for(db, current_user.id, [b.id for b in books])

    all_status_rows = (
        db.query(models.Book.status, func.count(models.Book.id))
        .filter(
            models.Book.person_id == current_user.id,
            models.Book.deleted == False,
        )
        .group_by(models.Book.status)
        .all()
    )
    by_status = {s: c for s, c in all_status_rows}
    total = sum(by_status.values())

    return {
        "items": [_serialize_book(b, counts.get(b.id, 0)) for b in books],
        "total": total,
        "by_status": by_status,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_book(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    status_value: Optional[str] = Form("reading", alias="status"),
    cover_url: Optional[str] = Form(None),
    isbn: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File is required")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported right now")
    if status_value and status_value not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status_value}")

    user_dir = _user_dir(current_user.id)
    safe_name = _safe_filename(file.filename)
    final_name = f"{uuid.uuid4().hex[:12]}__{safe_name}"
    dest = user_dir / final_name

    bytes_written = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1 << 20)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_FILE_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large (>{MAX_FILE_BYTES // (1024 * 1024)} MB)",
                    )
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to write uploaded PDF")
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Could not save file") from exc

    pdf_meta = _extract_pdf_metadata(dest)
    final_title = (title or "").strip() or pdf_meta["title"] or Path(file.filename).stem
    final_author = (author or "").strip() or pdf_meta["author"] or None

    book = models.Book(
        person_id=current_user.id,
        title=final_title[:300],
        author=(final_author or None) and final_author[:200],
        file_path=str(dest.relative_to(UPLOAD_ROOT)),
        file_size_bytes=bytes_written,
        total_pages=pdf_meta["total_pages"],
        current_page=1,
        status=status_value or "reading",
        cover_url=(cover_url or None),
        isbn=(isbn or None),
        tags=(tags or None),
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return _serialize_book(book)


@router.get("/{book_id}")
def get_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    book = _own_book_or_404(db, current_user.id, book_id)
    count = _highlight_counts_for(db, current_user.id, [book.id]).get(book.id, 0)
    return _serialize_book(book, count)


@router.patch("/{book_id}")
def update_book(
    book_id: int,
    payload: schemas.BookUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    book = _own_book_or_404(db, current_user.id, book_id)

    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    prev_page = book.current_page
    page_changed = False
    if "current_page" in data and data["current_page"] is not None:
        new_page = max(1, int(data["current_page"]))
        if book.total_pages > 0:
            new_page = min(new_page, book.total_pages)
        data["current_page"] = new_page
        page_changed = new_page != prev_page

    for key, value in data.items():
        setattr(book, key, value)

    book.last_opened_at = datetime.utcnow()

    if (
        "status" not in data
        and book.total_pages > 0
        and book.current_page >= book.total_pages
        and book.status != "done"
    ):
        book.status = "done"
        book.finished_at = datetime.utcnow()
    elif data.get("status") == "done" and not book.finished_at:
        book.finished_at = datetime.utcnow()

    if page_changed and book.current_page > prev_page:
        session_row = models.ReadingSession(
            book_id=book.id,
            person_id=current_user.id,
            started_at=datetime.utcnow(),
            ended_at=datetime.utcnow(),
            start_page=prev_page,
            end_page=book.current_page,
            pages_read=book.current_page - prev_page,
            minutes=None,
        )
        db.add(session_row)

    db.commit()
    db.refresh(book)
    count = _highlight_counts_for(db, current_user.id, [book.id]).get(book.id, 0)
    return _serialize_book(book, count)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(
    book_id: int,
    hard: bool = Query(False, description="When true, also unlink the file from disk."),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    book = _own_book_or_404(db, current_user.id, book_id)
    file_path = UPLOAD_ROOT / book.file_path
    if hard:
        db.delete(book)
        try:
            if file_path.exists():
                file_path.unlink()
        except OSError as exc:
            logger.warning("Could not unlink %s: %s", file_path, exc)
    else:
        book.deleted = True
    db.commit()
    return None


@router.get("/{book_id}/file")
def stream_book_file(
    book_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    book = _own_book_or_404(db, current_user.id, book_id)
    abs_path = (UPLOAD_ROOT / book.file_path).resolve()

    try:
        abs_path.relative_to(UPLOAD_ROOT.resolve())
    except ValueError:
        logger.error("Book %s points outside upload root: %s", book.id, abs_path)
        raise HTTPException(status_code=404, detail="Book file missing")

    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="Book file missing")

    return FileResponse(
        path=str(abs_path),
        media_type="application/pdf",
        filename=f"book-{book.id}.pdf",
        headers={"Cache-Control": "private, max-age=0, must-revalidate"},
    )


# ─── Highlights ──────────────────────────────────────────────────────────────

@router.get("/{book_id}/highlights")
def list_highlights(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_book_or_404(db, current_user.id, book_id)
    rows = (
        db.query(
            models.BookHighlight,
            models.DictionaryWord.translation,
            models.DictionaryWord.definition,
        )
        .outerjoin(
            models.DictionaryWord,
            models.DictionaryWord.id == models.BookHighlight.dictionary_word_id,
        )
        .filter(
            models.BookHighlight.book_id == book_id,
            models.BookHighlight.person_id == current_user.id,
        )
        .order_by(models.BookHighlight.page.asc(), models.BookHighlight.created_at.asc())
        .all()
    )
    return [
        _serialize_highlight(h, translation, definition)
        for h, translation, definition in rows
    ]


@router.post("/{book_id}/highlights", status_code=status.HTTP_201_CREATED)
def create_highlight(
    book_id: int,
    payload: schemas.BookHighlightCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    book = _own_book_or_404(db, current_user.id, book_id)

    dictionary_word_id: Optional[int] = None
    if payload.save_to_dictionary:
        raw = (payload.text or "").strip()
        token = raw if len(raw) <= 80 else raw.split("\n", 1)[0][:80]
        if not token:
            raise HTTPException(status_code=400, detail="Selection is empty")

        existing = (
            db.query(models.DictionaryWord)
            .filter(
                models.DictionaryWord.person_id == current_user.id,
                func.lower(models.DictionaryWord.word) == token.lower(),
                models.DictionaryWord.deleted == False,
            )
            .first()
        )
        if not existing:
            normalized = _norm_word_for_dedup(token)
            if normalized:
                others = (
                    db.query(models.DictionaryWord)
                    .filter(
                        models.DictionaryWord.person_id == current_user.id,
                        models.DictionaryWord.deleted == False,
                    )
                    .all()
                )
                existing = next(
                    (w for w in others if _norm_word_for_dedup(w.word) == normalized),
                    None,
                )

        sentence_candidate = (payload.source_sentence or "").strip()
        if not sentence_candidate and len((payload.text or "").strip()) > len(token):
            sentence_candidate = (payload.text or "").strip()
        sentence_for_word: Optional[str] = sentence_candidate or None

        if existing:
            dictionary_word_id = existing.id
            updated = False
            if existing.source_book_id is None:
                existing.source_book_id = book.id
                updated = True
            if existing.source_page is None:
                existing.source_page = payload.page
                updated = True
            if not existing.source_sentence and sentence_for_word:
                existing.source_sentence = sentence_for_word
                updated = True
            if updated:
                db.flush()
        else:
            ai_definition, ai_translation = _lookup_definition(
                token, context=payload.note or payload.text
            )
            word = models.DictionaryWord(
                person_id=current_user.id,
                module_id=payload.module_id,
                word=token,
                definition=(
                    payload.note
                    or ai_definition
                    or "(saved from reader — fill definition)"
                ),
                translation=ai_translation or None,
                difficulty="B1",
                tags=f"book:{book.id}|page:{payload.page}",
                source_book_id=book.id,
                source_page=payload.page,
                source_sentence=sentence_for_word,
            )
            db.add(word)
            db.flush()
            dictionary_word_id = word.id

    if payload.kind == "vocab" and dictionary_word_id is not None:
        dup = (
            db.query(models.BookHighlight)
            .filter(
                models.BookHighlight.book_id == book.id,
                models.BookHighlight.person_id == current_user.id,
                models.BookHighlight.page == payload.page,
                models.BookHighlight.text == payload.text,
                models.BookHighlight.dictionary_word_id == dictionary_word_id,
                models.BookHighlight.kind == "vocab",
            )
            .first()
        )
        if dup:
            dup_translation: Optional[str] = None
            dup_definition: Optional[str] = None
            if dup.dictionary_word_id:
                w = db.query(models.DictionaryWord).filter(
                    models.DictionaryWord.id == dup.dictionary_word_id
                ).first()
                if w:
                    dup_translation = w.translation
                    dup_definition = w.definition
            return _serialize_highlight(dup, dup_translation, dup_definition)

    hl = models.BookHighlight(
        book_id=book.id,
        person_id=current_user.id,
        page=payload.page,
        text=payload.text,
        note=payload.note,
        kind=payload.kind,
        color=payload.color,
        dictionary_word_id=dictionary_word_id,
        source_sentence=(payload.source_sentence or "").strip() or None,
    )
    db.add(hl)
    db.commit()
    db.refresh(hl)
    translation: Optional[str] = None
    definition: Optional[str] = None
    if hl.dictionary_word_id:
        word = db.query(models.DictionaryWord).filter(
            models.DictionaryWord.id == hl.dictionary_word_id
        ).first()
        if word:
            translation = word.translation
            definition = word.definition
    return _serialize_highlight(hl, translation, definition)


@router.post("/{book_id}/highlights/{highlight_id}/refresh-definition")
def refresh_highlight_definition(
    book_id: int,
    highlight_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_book_or_404(db, current_user.id, book_id)
    hl = (
        db.query(models.BookHighlight)
        .filter(
            models.BookHighlight.id == highlight_id,
            models.BookHighlight.book_id == book_id,
            models.BookHighlight.person_id == current_user.id,
        )
        .first()
    )
    if not hl or not hl.dictionary_word_id:
        raise HTTPException(status_code=404, detail="Vocab highlight not found")

    word = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.id == hl.dictionary_word_id
    ).first()
    if not word:
        raise HTTPException(status_code=404, detail="Dictionary word not found")

    ai_definition, ai_translation = _lookup_definition(word.word, context=hl.text)

    placeholder = "(saved from reader — fill definition)"
    changed = False
    if ai_definition and (not word.definition or word.definition == placeholder):
        word.definition = ai_definition
        changed = True
    if ai_translation and not word.translation:
        word.translation = ai_translation
        changed = True
    if changed:
        db.commit()
        db.refresh(word)
    return _serialize_highlight(hl, word.translation, word.definition)


@router.patch("/{book_id}/highlights/{highlight_id}")
def update_highlight(
    book_id: int,
    highlight_id: int,
    payload: schemas.BookHighlightUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_book_or_404(db, current_user.id, book_id)
    hl = (
        db.query(models.BookHighlight)
        .filter(
            models.BookHighlight.id == highlight_id,
            models.BookHighlight.book_id == book_id,
            models.BookHighlight.person_id == current_user.id,
        )
        .first()
    )
    if not hl:
        raise HTTPException(status_code=404, detail="Highlight not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(hl, key, value)
    db.commit()
    db.refresh(hl)
    return {
        "id": hl.id,
        "book_id": hl.book_id,
        "page": hl.page,
        "text": hl.text,
        "note": hl.note,
        "kind": hl.kind,
        "color": hl.color,
        "dictionary_word_id": hl.dictionary_word_id,
        "created_at": hl.created_at,
    }


@router.delete("/{book_id}/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(
    book_id: int,
    highlight_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_book_or_404(db, current_user.id, book_id)
    hl = (
        db.query(models.BookHighlight)
        .filter(
            models.BookHighlight.id == highlight_id,
            models.BookHighlight.book_id == book_id,
            models.BookHighlight.person_id == current_user.id,
        )
        .first()
    )
    if not hl:
        raise HTTPException(status_code=404, detail="Highlight not found")
    db.delete(hl)
    db.commit()
    return None


# ─── Sessions / stats ────────────────────────────────────────────────────────

@router.get("/{book_id}/sessions")
def list_sessions(
    book_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_book_or_404(db, current_user.id, book_id)
    rows = (
        db.query(models.ReadingSession)
        .filter(
            models.ReadingSession.book_id == book_id,
            models.ReadingSession.person_id == current_user.id,
        )
        .order_by(models.ReadingSession.started_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "book_id": r.book_id,
            "started_at": r.started_at,
            "ended_at": r.ended_at,
            "start_page": r.start_page,
            "end_page": r.end_page,
            "pages_read": r.pages_read,
            "minutes": r.minutes,
        }
        for r in rows
    ]


@router.post("/{book_id}/sessions", status_code=status.HTTP_201_CREATED)
def create_session(
    book_id: int,
    payload: schemas.ReadingSessionCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    book = _own_book_or_404(db, current_user.id, book_id)
    if book.total_pages > 0 and payload.end_page > book.total_pages:
        raise HTTPException(status_code=400, detail="end_page exceeds total_pages")

    start = book.current_page
    end = max(start, payload.end_page)
    session_row = models.ReadingSession(
        book_id=book.id,
        person_id=current_user.id,
        started_at=datetime.utcnow(),
        ended_at=datetime.utcnow(),
        start_page=start,
        end_page=end,
        pages_read=max(0, end - start),
        minutes=payload.minutes,
    )
    db.add(session_row)

    book.current_page = end
    book.last_opened_at = datetime.utcnow()
    if book.total_pages > 0 and book.current_page >= book.total_pages and book.status != "done":
        book.status = "done"
        book.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(session_row)
    return {
        "id": session_row.id,
        "book_id": session_row.book_id,
        "started_at": session_row.started_at,
        "ended_at": session_row.ended_at,
        "start_page": session_row.start_page,
        "end_page": session_row.end_page,
        "pages_read": session_row.pages_read,
        "minutes": session_row.minutes,
    }


@router.get("/stats/overview")
def library_stats(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    books = (
        db.query(models.Book)
        .filter(
            models.Book.person_id == current_user.id,
            models.Book.deleted == False,
        )
        .all()
    )
    by_status = {"want": 0, "reading": 0, "done": 0}
    pages_read_total = 0
    for b in books:
        by_status[b.status] = by_status.get(b.status, 0) + 1
        pages_read_total += min(b.current_page, b.total_pages or b.current_page)

    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=30)
    pages_30d = (
        db.query(func.coalesce(func.sum(models.ReadingSession.pages_read), 0))
        .filter(
            models.ReadingSession.person_id == current_user.id,
            models.ReadingSession.started_at >= cutoff,
        )
        .scalar()
    ) or 0

    return {
        "total_books": len(books),
        "by_status": by_status,
        "pages_read_total": pages_read_total,
        "pages_last_30d": int(pages_30d or 0),
    }
