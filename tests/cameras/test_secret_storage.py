import asyncio

from app.db.repository import InMemoryRepository


def test_camera_password_is_encrypted_at_rest_and_decrypted_for_backend_use() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        await repository.save_camera({
            "id": "CAM-SECRET",
            "name": "Secure camera",
            "connection_url": "rtsp://camera.local/live",
            "username": "camera-user",
            "password": "super-secret",
        })

        stored = repository.cameras["CAM-SECRET"]
        assert stored["password_secret"] != "super-secret"
        assert stored["password_secret"].startswith("enc:v1:")

        internal = await repository.get_camera("CAM-SECRET")
        assert internal["password_secret"] == "super-secret"

    asyncio.run(scenario())


def test_camera_url_credentials_are_removed_from_at_rest_payload() -> None:
    async def scenario() -> None:
        repository = InMemoryRepository()
        await repository.save_camera({
            "id": "CAM-URL-SECRET",
            "name": "URL camera",
            "connection_url": "rtsp://url-user:secret%40value@camera.local/live",
        })

        stored = repository.cameras["CAM-URL-SECRET"]
        assert stored["connection_url"] == "rtsp://camera.local/live"
        assert "password" not in stored
        assert stored["password_secret"].startswith("enc:v1:")

        internal = await repository.get_camera("CAM-URL-SECRET")
        assert internal["username"] == "url-user"
        assert internal["password_secret"] == "secret@value"

    asyncio.run(scenario())
