"""
LLM provider chain: Gemini → OpenAI → Groq.

Shared by tasks (conclusions, weekly tip) and routers (dictionary,
essays, practice, etc.) via lazy `from app.tasks import _generate_text`.
"""
import logging

logger = logging.getLogger(__name__)


def _call_gemini(prompt: str, *, max_tokens: int = 300, temperature: float = 0.7) -> str:
    """Call Google Gemini's generativelanguage REST endpoint and return the
    generated text. Picked as the primary provider because its free tier is
    generous (1500 req/day on gemini-2.0-flash) and the endpoint is
    reachable from regions where OpenAI / Groq are blocked. Returns "" if
    no key is configured; raises on HTTP errors so ``_generate_text`` can
    fall back to the next provider.
    """
    import httpx
    from app.config import settings

    if not settings.GEMINI_API_KEY:
        return ""

    model = settings.GEMINI_MODEL or "gemini-2.0-flash"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    with httpx.Client(timeout=30, trust_env=False) as client:
        resp = client.post(
            url,
            headers={"x-goog-api-key": settings.GEMINI_API_KEY},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens,
                },
            },
        )
    if resp.status_code >= 400:
        logger.warning("Gemini %s: %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        return ""
    content = (candidates[0] or {}).get("content") or {}
    parts = content.get("parts") or []
    if not parts:
        return ""
    text = (parts[0] or {}).get("text") or ""
    return text.strip()


def _call_openai(prompt: str, *, max_tokens: int = 300, temperature: float = 0.7) -> str:
    """Call the OpenAI-compatible Chat Completions endpoint and return the
    generated text. Honours ``OPENAI_BASE_URL`` so requests can be routed
    through a Cloudflare Worker, OpenRouter, Azure relay, or any other
    drop-in OpenAI proxy — which is the only way to reach OpenAI from a
    VPS whose IP is geo-blocked by ``api.openai.com``.
    """
    import httpx
    from app.config import settings

    if not settings.OPENAI_API_KEY:
        return ""

    base = (settings.OPENAI_BASE_URL or "https://api.openai.com/v1").rstrip("/")
    url = f"{base}/chat/completions"

    # trust_env=False ignores HTTP_PROXY/HTTPS_PROXY env on the server so a
    # misconfigured corporate proxy can't intercept this request and return 407.
    client_kwargs = {"timeout": 30, "trust_env": False}
    if settings.OPENAI_PROXY_URL:
        client_kwargs["proxy"] = settings.OPENAI_PROXY_URL
        logger.info("OpenAI request routed through proxy")

    with httpx.Client(**client_kwargs) as client:
        resp = client.post(
            url,
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": settings.OPENAI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
    if resp.status_code >= 400:
        logger.warning("OpenAI %s (%s): %s", resp.status_code, url, resp.text[:300])
        resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _call_groq(prompt: str, *, max_tokens: int = 300, temperature: float = 0.7) -> str:
    """Call Groq API and return the generated text."""
    import httpx
    from app.config import settings

    if not settings.GROQ_API_KEY:
        return ""

    with httpx.Client(timeout=30, trust_env=False) as client:
        resp = client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _generate_text(prompt: str, *, max_tokens: int = 300, temperature: float = 0.7) -> str:
    """Run the AI provider chain in priority order:
        1. Gemini  — primary; free tier + works where OpenAI/Groq are blocked
        2. OpenAI  — secondary; falls back when Gemini is unconfigured / down
        3. Groq    — last resort

    Returns the first non-empty response. Each provider is independent — a
    failure in one (timeout, 4xx, missing key) advances to the next without
    raising, so a single dead key never breaks definition lookups.
    """
    from app.config import settings

    if settings.GEMINI_API_KEY:
        try:
            text = _call_gemini(prompt, max_tokens=max_tokens, temperature=temperature)
            if text:
                return text
        except Exception as e:
            logger.warning("_generate_text: Gemini failed, falling back to OpenAI: %s", e)

    if settings.OPENAI_API_KEY:
        try:
            text = _call_openai(prompt, max_tokens=max_tokens, temperature=temperature)
            if text:
                return text
        except Exception as e:
            logger.warning("_generate_text: OpenAI failed, falling back to Groq: %s", e)

    if settings.GROQ_API_KEY:
        try:
            return _call_groq(prompt, max_tokens=max_tokens, temperature=temperature)
        except Exception as e:
            logger.warning("_generate_text: Groq failed, no more providers: %s", e)

    return ""
