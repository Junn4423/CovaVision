import asyncio

from app.camera.stream_manager import (
    CameraStreamManager,
    _build_digest_authorization,
    _parse_digest_challenge,
)
from app.db.repository import PrismaRepository
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password


def test_password_hash_round_trip() -> None:
    password = "correct horse battery staple"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_round_trip() -> None:
    token = create_access_token("user-1", role="ADMIN", expires_in_seconds=60)

    claims = decode_access_token(token)

    assert claims["sub"] == "user-1"
    assert claims["role"] == "ADMIN"


def test_camera_stream_options_are_clamped_for_low_latency() -> None:
    manager = CameraStreamManager(max_fps=30, jpeg_quality=75)

    assert manager._option_float(60, 30, minimum=5, maximum=30) == 30
    assert manager._option_float(2, 30, minimum=5, maximum=30) == 5
    assert manager._option_int(82, 75, minimum=40, maximum=95) == 82
    assert manager._option_int("bad", 75, minimum=40, maximum=95) == 75


def test_camera_stream_options_merge_processing_limits() -> None:
    options = CameraStreamManager._resolve_stream_options({
        "camera_options": {"target_fps": 30, "frame_width": 1280},
        "processing_options": {"fps_limit": 15, "stream_jpeg_quality": 60},
    })

    assert options["target_fps"] == 30
    assert options["fps_limit"] == 15
    assert options["stream_jpeg_quality"] == 60
    assert options["frame_width"] == 1280


def test_camera_stream_parser_keeps_only_the_newest_complete_jpeg() -> None:
    buffer = bytearray(b"noise\xff\xd8old\xff\xd9junk\xff\xd8new\xff\xd9tail")

    frame = CameraStreamManager._extract_latest_jpeg(buffer)

    assert frame == b"\xff\xd8new\xff\xd9"
    # The parser keeps the final incomplete byte so it can join with the next
    # stdout chunk without retaining the preceding burst.
    assert bytes(buffer) == b"l"


def test_snapshot_targets_do_not_copy_rtsp_credentials() -> None:
    targets = CameraStreamManager._resolve_snapshot_targets(
        "rtsp://admin:secret@192.168.1.20:554/Streaming/Channels/102",
        {"snapshot_path": "/snapshot.jpg", "snapshot_http_port": 8080},
    )

    assert targets[0] == "http://192.168.1.20:8080/snapshot.jpg"
    assert all("admin" not in target and "secret" not in target for target in targets)


def test_digest_challenge_authorization_never_contains_password() -> None:
    challenge = _parse_digest_challenge('Digest realm="camera", nonce="nonce", qop="auth"')
    assert challenge is not None

    authorization = _build_digest_authorization(challenge, "admin", "secret", "GET", "/snapshot.jpg")

    assert authorization.startswith("Digest ")
    assert 'username="admin"' in authorization
    assert "secret" not in authorization


def test_prisma_repository_connects_once_for_concurrent_requests() -> None:
    repository = PrismaRepository()

    class FakeClient:
        calls = 0

        async def connect(self) -> None:
            self.calls += 1
            await asyncio.sleep(0)

    client = FakeClient()
    repository.client = client

    async def connect_concurrently() -> None:
        await asyncio.gather(*(repository._ensure_connected() for _ in range(8)))

    asyncio.run(connect_concurrently())

    assert client.calls == 1
