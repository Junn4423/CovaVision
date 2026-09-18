from app.camera.stream_manager import CameraStreamManager
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
