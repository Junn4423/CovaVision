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

