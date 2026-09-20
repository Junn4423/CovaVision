from __future__ import annotations

import wave

from app.camera import speaker


def test_speaker_digest_and_rtsp_helpers_keep_credentials_out_of_headers(tmp_path) -> None:
    challenge = speaker._digest_challenge('Digest realm="camera", nonce="abc", qop="auth"')
    assert challenge["realm"] == "camera"
    authorization = speaker._digest_authorization(
        challenge,
        "admin",
        "secret",
        "DESCRIBE",
        "rtsp://camera/live",
        1,
    )
    assert authorization.startswith("Digest ")
    assert 'username="admin"' in authorization
    assert "secret" not in authorization
    assert speaker._status_code("RTSP/1.0 200 OK") == 200
    assert speaker._status_code("broken") == 0

    uri, host, port = speaker._rtsp_uri("rtsp://admin:secret@camera.example:8554/live")
    assert uri == "rtsp://camera.example:8554/live"
    assert host == "camera.example"
    assert port == 8554

    audio = tmp_path / "tone.wav"
    speaker._write_pcm_wav(audio, 200)
    with wave.open(str(audio), "rb") as file:
        assert file.getnchannels() == 1
        assert file.getframerate() == 16000
        assert file.getnframes() > 0


def test_speaker_returns_safe_failures_before_network(monkeypatch) -> None:
    missing = speaker.speak_to_camera({}, {"text": "hello"})
    assert missing["success"] is False

    monkeypatch.setattr(speaker.CameraStreamManager, "_resolve_ffmpeg_path", staticmethod(lambda: ""))
    unavailable = speaker.speak_to_camera(
        {"connection_url": "rtsp://camera.example/live"},
        {"text": "hello", "volume": "invalid"},
    )
    assert unavailable["success"] is False
