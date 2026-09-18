"""Optional computer-vision dependencies.

The API can start for administration and health checks without the heavy vision
stack. The recognition engine reports an actionable error only when it is used.
"""

from __future__ import annotations

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ModuleNotFoundError as exc:  # pragma: no cover - depends on installation extras
    cv2 = None
    np = None
    Image = ImageDraw = ImageFont = ImageOps = None
    _IMPORT_ERROR = exc
else:
    _IMPORT_ERROR = None


def require_vision_dependencies() -> None:
    if _IMPORT_ERROR is not None:
        raise RuntimeError(
            "Vision dependencies are not installed. "
            "Install the backend with `pip install -e '.[vision]'`."
        ) from _IMPORT_ERROR

