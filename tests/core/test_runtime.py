from __future__ import annotations

from pathlib import Path

from app.core import runtime


def test_runtime_resolves_repository_root_and_configured_data_dir(monkeypatch, tmp_path: Path) -> None:
    root = runtime.resolve_project_root()
    assert (root / "pyproject.toml").is_file()

    configured = tmp_path / "covavision-data"
    monkeypatch.setenv("COVAVISION_DATA_DIR", str(configured))
    assert runtime.resolve_data_dir() == configured
    assert configured.is_dir()


def test_runtime_uses_frozen_executable_root(monkeypatch, tmp_path: Path) -> None:
    executable = tmp_path / "app" / "covavision.exe"
    executable.parent.mkdir()
    executable.touch()
    monkeypatch.setattr(runtime.sys, "frozen", True, raising=False)
    monkeypatch.setattr(runtime.sys, "executable", str(executable))
    assert runtime.resolve_project_root() == executable.parent
