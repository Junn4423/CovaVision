from __future__ import annotations

import asyncio

from app.camera.stream_manager import CameraStreamManager


def test_stream_manager_rejects_missing_or_non_rtsp_sources_without_starting_workers() -> None:
    async def scenario() -> None:
        manager = CameraStreamManager()
        assert (await manager.start("camera-1", {}))["success"] is False
        invalid = await manager.start("camera-2", {"connection_url": "https://example.test/live"})
        assert invalid["success"] is False
        assert manager.status() == {"running": False, "camera_id": None, "fps": 0, "error": ""}
        assert manager.snapshot("camera-1") is None
        assert manager.stop("missing")["stopped"] == 0

    asyncio.run(scenario())


def test_stream_manager_resolves_encoded_credentials_and_ipv6_snapshot_targets() -> None:
    credentials = CameraStreamManager._resolve_credentials(
        "rtsp://user%40name:p%40ss@[2001:db8::1]:554/live",
        {},
    )
    assert credentials == {"username": "user@name", "password": "p@ss"}

    targets = CameraStreamManager._resolve_snapshot_targets(
        "rtsp://[2001:db8::1]:554/live",
        {"snapshot_protocol": "https", "snapshot_http_port": 443, "snapshot_path": "frame.jpg"},
    )
    assert targets[0] == "https://[2001:db8::1]/frame.jpg"


def test_stream_manager_normalizes_invalid_protocol_port_and_options() -> None:
    targets = CameraStreamManager._resolve_snapshot_targets(
        "rtsp://camera.example/live",
        {"snapshot_protocol": "ftp", "snapshot_http_port": 70000, "snapshot_path": "frame.jpg"},
    )
    assert targets[0] == "http://camera.example/frame.jpg"
