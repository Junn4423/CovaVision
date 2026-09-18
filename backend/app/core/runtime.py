"""Runtime paths shared by the API and the recognition engine."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def resolve_project_root() -> Path:
    """Return the repository root in development and the executable root when frozen."""

    if getattr(sys, "frozen", False):
        executable_dir = Path(sys.executable).resolve().parent
        internal_dir = executable_dir / "_internal"
        return internal_dir if internal_dir.is_dir() else executable_dir

    return Path(__file__).resolve().parents[3]


def resolve_data_dir() -> Path:
    """Return the writable CovaVision data directory and create it on demand."""

    configured = os.getenv("COVAVISION_DATA_DIR", "data")
    data_dir = Path(configured).expanduser()
    if not data_dir.is_absolute():
        data_dir = resolve_project_root() / data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir
