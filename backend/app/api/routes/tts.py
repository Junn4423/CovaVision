"""TTS audio generation and caching route."""
from __future__ import annotations

import urllib.parse
import urllib.request
from fastapi import APIRouter, HTTPException, Query, Response

router = APIRouter(prefix="/api/v1/tts", tags=["tts"])

# In-memory cache for audio bytes (keep up to 200 common audio snippets)
_AUDIO_CACHE: dict[str, bytes] = {}
_MAX_CACHE_SIZE = 200


def _get_google_tts_bytes(text: str, lang: str = "vi") -> bytes | None:
    cache_key = f"{lang}:{text}"
    if cache_key in _AUDIO_CACHE:
        return _AUDIO_CACHE[cache_key]

    query = urllib.parse.urlencode({
        "ie": "UTF-8",
        "q": text,
        "tl": lang,
        "client": "tw-ob",
    })
    request = urllib.request.Request(
        f"https://translate.google.com/translate_tts?{query}",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            data = response.read()
        if len(data) <= 100:
            return None
        if len(_AUDIO_CACHE) >= _MAX_CACHE_SIZE:
            oldest_key = next(iter(_AUDIO_CACHE))
            _AUDIO_CACHE.pop(oldest_key, None)
        _AUDIO_CACHE[cache_key] = data
        return data
    except (OSError, ValueError):
        return None


@router.get("")
@router.head("")
async def get_tts_audio(
    text: str = Query(..., min_length=1, max_length=500),
    lang: str = Query("vi", min_length=2, max_length=10),
) -> Response:
    text_clean = text.strip()
    if not text_clean:
        raise HTTPException(status_code=400, detail="text is required")

    audio_bytes = _get_google_tts_bytes(text_clean, lang)
    if not audio_bytes:
        raise HTTPException(status_code=503, detail="TTS service unavailable")

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )
