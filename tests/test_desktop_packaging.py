import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).parents[1]
DESKTOP = ROOT / "apps" / "desktop"


def test_desktop_release_declares_backend_and_model_resources() -> None:
    package = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))
    build = package["build"]
    resource_targets = {item["to"] for item in build["extraResources"]}

    assert "prepare:backend-runtime" in package["scripts"]["pack:electron"]
    assert "backend-runtime" in resource_targets
    assert "insightface_models" in resource_targets
    assert "prisma" in resource_targets

    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert "packaging = [" in pyproject
    assert "pyinstaller" in pyproject


def test_packaged_electron_runtime_points_to_local_backend_bundle() -> None:
    script = """
const {resolveBackendRuntimeTarget} = require('./apps/desktop/electron/runtimeConfig');
process.stdout.write(JSON.stringify(resolveBackendRuntimeTarget({
  isPackaged: true,
  resourcesPath: 'C:/Program Files/CovaVision/resources',
  platform: 'win32',
})));
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    target = json.loads(result.stdout)

    assert target["usesLocalBackend"] is True
    assert target["apiBaseUrl"] == "http://127.0.0.1:8000"
    assert target["backendExecutable"].endswith("backend-runtime\\covavision-backend.exe")
    assert target["insightfaceHome"].endswith("insightface_models")
